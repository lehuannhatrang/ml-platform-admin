/*
Copyright 2024 The Karmada Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package unstructured

import (
	"context"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
)

// validateResourceParams validates the required resource parameters
func validateResourceParams(kind, namespace, name string) error {
	if kind == "" {
		return fmt.Errorf("kind is required")
	}
	if namespace == "" {
		return fmt.Errorf("namespace is required")
	}
	if name == "" {
		return fmt.Errorf("name is required")
	}
	return nil
}

// getGroupVersionResource returns the GroupVersionResource for a given kind
func getGroupVersionResource(kind string) schema.GroupVersionResource {
	lowerKind := strings.ToLower(kind)
	kindToGVR := map[string]schema.GroupVersionResource{
		"deployment": {
			Group:    "apps",
			Version:  "v1",
			Resource: "deployments",
		},
		"statefulset": {
			Group:    "apps",
			Version:  "v1",
			Resource: "statefulsets",
		},
		"daemonset": {
			Group:    "apps",
			Version:  "v1",
			Resource: "daemonsets",
		},
		"job": {
			Group:    "batch",
			Version:  "v1",
			Resource: "jobs",
		},
		"cronjob": {
			Group:    "batch",
			Version:  "v1",
			Resource: "cronjobs",
		},
		"pod": {
			Group:    "",
			Version:  "v1",
			Resource: "pods",
		},
		"service": {
			Group:    "",
			Version:  "v1",
			Resource: "services",
		},
		"configmap": {
			Group:    "",
			Version:  "v1",
			Resource: "configmaps",
		},
		"secret": {
			Group:    "",
			Version:  "v1",
			Resource: "secrets",
		},
		"namespace": {
			Group:    "",
			Version:  "v1",
			Resource: "namespaces",
		},
		"persistentvolume": {
			Group:    "",
			Version:  "v1",
			Resource: "persistentvolumes",
		},
		"persistentvolumeclaim": {
			Group:    "",
			Version:  "v1",
			Resource: "persistentvolumeclaims",
		},
		"ingress": {
			Group:    "networking.k8s.io",
			Version:  "v1",
			Resource: "ingresses",
		},
		"replicaset": {
			Group:    "apps",
			Version:  "v1",
			Resource: "replicasets",
		},
		"customresourcedefinition": {
			Group:    "apiextensions.k8s.io",
			Version:  "v1",
			Resource: "customresourcedefinitions",
		},
		"policytemplate": {
			Group:    "policy.karmada.io",
			Version:  "v1alpha1",
			Resource: "policytemplates",
		},
		"overridepolicy": {
			Group:    "policy.karmada.io",
			Version:  "v1alpha1",
			Resource: "overridepolicies",
		},
		"propagationpolicy": {
			Group:    "policy.karmada.io",
			Version:  "v1alpha1",
			Resource: "propagationpolicies",
		},
		"resourcebinding": {
			Group:    "work.karmada.io",
			Version:  "v1alpha2",
			Resource: "resourcebindings",
		},
		"federatedresourcequota": {
			Group:    "policy.karmada.io",
			Version:  "v1alpha1",
			Resource: "federatedresourcequotas",
		},
		"cluster": {
			Group:    "cluster.karmada.io",
			Version:  "v1alpha1",
			Resource: "clusters",
		},
		"clusteroverridepolicy": {
			Group:    "policy.karmada.io",
			Version:  "v1alpha1",
			Resource: "clusteroverridepolicies",
		},
		"clusterpropagationpolicy": {
			Group:    "policy.karmada.io",
			Version:  "v1alpha1",
			Resource: "clusterpropagationpolicies",
		},
	}

	if gvr, found := kindToGVR[lowerKind]; found {
		return gvr
	}

	// Default: assume the resource is namespaced, plural form of the lowercase kind
	parts := strings.Split(lowerKind, ".")
	if len(parts) == 1 {
		return schema.GroupVersionResource{
			Group:    "",
			Version:  "v1",
			Resource: lowerKind + "s", // Naive pluralization, might not work for all cases
		}
	}

	// If kind contains dots, treat the last part as the resource name
	// and the rest as group + version
	resource := parts[len(parts)-1] + "s" // Naive pluralization
	group := strings.Join(parts[:len(parts)-1], ".")
	return schema.GroupVersionResource{
		Group:    group,
		Version:  "v1", // Assume v1 as default
		Resource: resource,
	}
}

// isClusterScopedResource returns true if the resource is cluster-scoped (not namespaced)
func isClusterScopedResource(kind string) bool {
	clusterScoped := map[string]bool{
		"namespace":                true,
		"persistentvolume":         true,
		"customresourcedefinition": true,
		"cluster":                  true,
		"clusteroverridepolicy":    true,
		"clusterpropagationpolicy": true,
	}

	return clusterScoped[strings.ToLower(kind)]
}

// createDynamicClient returns a dynamic client for the management cluster
func createDynamicClient() (dynamic.Interface, error) {
	return client.GetDynamicClient()
}

// HandleGetMgmtResource gets a resource from the management cluster
func HandleGetMgmtResource(c *gin.Context) {
	kind := c.Param("kind")
	namespace := c.Param("namespace")
	name := c.Param("name")

	if err := validateResourceParams(kind, namespace, name); err != nil {
		klog.ErrorS(err, "Invalid resource parameters")
		common.Fail(c, errors.NewBadRequest(err.Error()))
		return
	}

	// Create dynamic client for management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create client: %v", err)))
		return
	}
	

	gvr := getGroupVersionResource(kind)
	var result *unstructured.Unstructured

	// Determine if the resource is cluster-scoped or namespaced
	if isClusterScopedResource(kind) {
		result, err = dynamicClient.Resource(gvr).Get(context.TODO(), name, metav1.GetOptions{})
	} else {
		result, err = dynamicClient.Resource(gvr).Namespace(namespace).Get(context.TODO(), name, metav1.GetOptions{})
	}

	if err != nil {
		klog.ErrorS(err, "Failed to get resource", "kind", kind, "namespace", namespace, "name", name)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to get resource: %v", err)))
		return
	}

	common.Success(c, result)
}

// HandleDeleteMgmtResource deletes a resource from the management cluster
func HandleDeleteMgmtResource(c *gin.Context) {
	kind := c.Param("kind")
	namespace := c.Param("namespace")
	name := c.Param("name")

	if err := validateResourceParams(kind, namespace, name); err != nil {
		klog.ErrorS(err, "Invalid resource parameters")
		common.Fail(c, errors.NewBadRequest(err.Error()))
		return
	}

	// Create dynamic client for management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create client: %v", err)))
		return
	}
	

	gvr := getGroupVersionResource(kind)
	
	deleteOptions := metav1.DeleteOptions{}
	
	// Determine if the resource is cluster-scoped or namespaced
	if isClusterScopedResource(kind) {
		err = dynamicClient.Resource(gvr).Delete(context.TODO(), name, deleteOptions)
	} else {
		err = dynamicClient.Resource(gvr).Namespace(namespace).Delete(context.TODO(), name, deleteOptions)
	}

	if err != nil {
		klog.ErrorS(err, "Failed to delete resource", "kind", kind, "namespace", namespace, "name", name)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to delete resource: %v", err)))
		return
	}

	common.Success(c, gin.H{"status": "success"})
}

// HandlePutMgmtResource updates a resource in the management cluster
func HandlePutMgmtResource(c *gin.Context) {
	kind := c.Param("kind")
	namespace := c.Param("namespace")
	name := c.Param("name")

	if err := validateResourceParams(kind, namespace, name); err != nil {
		klog.ErrorS(err, "Invalid resource parameters")
		common.Fail(c, errors.NewBadRequest(err.Error()))
		return
	}

	var requestBody map[string]interface{}
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		klog.ErrorS(err, "Failed to bind JSON")
		common.Fail(c, errors.NewBadRequest(err.Error()))
		return
	}

	// Create dynamic client for management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create client: %v", err)))
		return
	}
	

	gvr := getGroupVersionResource(kind)
	obj := &unstructured.Unstructured{Object: requestBody}
	
	var result *unstructured.Unstructured
	
	// Determine if the resource is cluster-scoped or namespaced
	if isClusterScopedResource(kind) {
		result, err = dynamicClient.Resource(gvr).Update(context.TODO(), obj, metav1.UpdateOptions{})
	} else {
		result, err = dynamicClient.Resource(gvr).Namespace(namespace).Update(context.TODO(), obj, metav1.UpdateOptions{})
	}

	if err != nil {
		klog.ErrorS(err, "Failed to update resource", "kind", kind, "namespace", namespace, "name", name)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to update resource: %v", err)))
		return
	}

	common.Success(c, result)
}

// HandleCreateMgmtResource creates a resource in the management cluster
func HandleCreateMgmtResource(c *gin.Context) {
	kind := c.Param("kind")
	namespace := c.Param("namespace")

	if kind == "" {
		klog.Error("Kind is required")
		common.Fail(c, errors.NewBadRequest("Kind is required"))
		return
	}

	var requestBody map[string]interface{}
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		klog.ErrorS(err, "Failed to bind JSON")
		common.Fail(c, errors.NewBadRequest(err.Error()))
		return
	}

	// Create dynamic client for management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create client: %v", err)))
		return
	}
	

	gvr := getGroupVersionResource(kind)
	obj := &unstructured.Unstructured{Object: requestBody}
	
	var result *unstructured.Unstructured
	
	// Determine if the resource is cluster-scoped or namespaced
	if isClusterScopedResource(kind) {
		result, err = dynamicClient.Resource(gvr).Create(context.TODO(), obj, metav1.CreateOptions{})
	} else {
		if namespace == "" {
			klog.Error("Namespace is required for namespaced resources")
			common.Fail(c, errors.NewBadRequest("Namespace is required for namespaced resources"))
			return
		}
		result, err = dynamicClient.Resource(gvr).Namespace(namespace).Create(context.TODO(), obj, metav1.CreateOptions{})
	}

	if err != nil {
		klog.ErrorS(err, "Failed to create resource", "kind", kind, "namespace", namespace)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create resource: %v", err)))
		return
	}

	common.Success(c, result)
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/resource/:kind/:namespace/:name", HandleGetMgmtResource)
		mgmtRouter.DELETE("/resource/:kind/:namespace/:name", HandleDeleteMgmtResource)
		mgmtRouter.PUT("/resource/:kind/:namespace/:name", HandlePutMgmtResource)
		mgmtRouter.POST("/resource/:kind/:namespace", HandleCreateMgmtResource)
		mgmtRouter.POST("/resource/:kind", HandleCreateMgmtResource) // For cluster-scoped resources
	}
	klog.InfoS("Registered management cluster unstructured resource routes")
}
