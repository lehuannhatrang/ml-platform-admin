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
)

const proxyURL = "/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy/"

// setupMemberClient creates a dynamic client for the member cluster
func setupMemberClient(c *gin.Context) (dynamic.Interface, error) {
	memberConfig, err := client.GetMemberConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get member config")
		return nil, fmt.Errorf("failed to get member config: %w", err)
	}

	karmadaConfig, _, err := client.GetKarmadaConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get karmada config")
		return nil, fmt.Errorf("failed to get karmada config: %w", err)
	}

	clusterName := c.Param("clustername")
	if clusterName == "" {
		return nil, fmt.Errorf("cluster name is required")
	}

	memberConfig.Host = karmadaConfig.Host + fmt.Sprintf(proxyURL, clusterName)
	klog.V(4).InfoS("Using member config", "host", memberConfig.Host)

	return dynamic.NewForConfig(memberConfig)
}

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
		"service": {
			Group:    "",
			Version:  "v1",
			Resource: "services",
		},
		"ingress": {
			Group:    "networking.k8s.io",
			Version:  "v1",
			Resource: "ingresses",
		},
		"pod": {
			Group:    "",
			Version:  "v1",
			Resource: "pods",
		},
		"replicaset": {
			Group:    "apps",
			Version:  "v1",
			Resource: "replicasets",
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
		"persistentvolume": {
			Group:    "",
			Version:  "v1",
			Resource: "persistentvolumes",
		},
		// Add more mappings as needed
	}

	if gvr, ok := kindToGVR[lowerKind]; ok {
		klog.V(4).InfoS("Using predefined GVR", "kind", kind, "group", gvr.Group, "version", gvr.Version, "resource", gvr.Resource)
		return gvr
	}

	// Default to core v1 group
	defaultGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: lowerKind + "s", // Simple pluralization, might need more complex logic
	}
	klog.V(4).InfoS("Using default GVR", "kind", kind, "group", defaultGVR.Group, "version", defaultGVR.Version, "resource", defaultGVR.Resource)
	return defaultGVR
}

// isClusterScopedResource returns true if the resource is cluster-scoped (not namespaced)
func isClusterScopedResource(kind string) bool {
	// List of known cluster-scoped resources
	clusterScopedResources := map[string]bool{
		"persistentvolume": true,
		"node":             true,
		"clusterrole":      true,
		"clusterrolebinding": true,
		"storageclass":     true,
		"namespace":        true,
	}
	
	return clusterScopedResources[strings.ToLower(kind)]
}

func handleGetResource(c *gin.Context) {
	dynamicClient, err := setupMemberClient(c)
	if err != nil {
		common.Fail(c, err)
		return
	}

	kind := c.Param("kind")
	namespace := c.Param("namespace")
	name := c.Param("name")

	if err := validateResourceParams(kind, namespace, name); err != nil {
		klog.ErrorS(err, "Invalid resource parameters")
		common.Fail(c, err)
		return
	}

	klog.V(4).InfoS("Getting resource", "kind", kind, "namespace", namespace, "name", name)

	gvr := getGroupVersionResource(strings.ToLower(kind))
	
	var result *unstructured.Unstructured
	
	if isClusterScopedResource(kind) {
		// Handle cluster-scoped resources without namespace
		result, err = dynamicClient.Resource(gvr).Get(context.Background(), name, metav1.GetOptions{})
	} else {
		// Handle namespaced resources
		result, err = dynamicClient.Resource(gvr).Namespace(namespace).Get(context.Background(), name, metav1.GetOptions{})
	}
	
	if err != nil {
		klog.ErrorS(err, "Failed to get resource", "kind", kind, "namespace", namespace, "name", name, "gvr", gvr)
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func handleDeleteResource(c *gin.Context) {
	dynamicClient, err := setupMemberClient(c)
	if err != nil {
		common.Fail(c, err)
		return
	}

	kind := c.Param("kind")
	namespace := c.Param("namespace")
	name := c.Param("name")

	gvr := getGroupVersionResource(kind)
	
	if isClusterScopedResource(kind) {
		// Handle cluster-scoped resources without namespace
		err = dynamicClient.Resource(gvr).Delete(context.Background(), name, metav1.DeleteOptions{})
	} else {
		// Handle namespaced resources
		err = dynamicClient.Resource(gvr).Namespace(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	}
	
	if err != nil {
		klog.ErrorS(err, "Failed to delete resource")
		common.Fail(c, err)
		return
	}
	common.Success(c, "ok")
}

func handlePutResource(c *gin.Context) {
	dynamicClient, err := setupMemberClient(c)
	if err != nil {
		common.Fail(c, err)
		return
	}

	kind := c.Param("kind")
	namespace := c.Param("namespace")

	var obj *unstructured.Unstructured
	if err := c.ShouldBindJSON(&obj); err != nil {
		klog.ErrorS(err, "Failed to bind JSON")
		common.Fail(c, err)
		return
	}

	gvr := getGroupVersionResource(kind)
	
	var result *unstructured.Unstructured
	
	if isClusterScopedResource(kind) {
		// Handle cluster-scoped resources without namespace
		result, err = dynamicClient.Resource(gvr).Update(context.Background(), obj, metav1.UpdateOptions{})
	} else {
		// Handle namespaced resources
		result, err = dynamicClient.Resource(gvr).Namespace(namespace).Update(context.Background(), obj, metav1.UpdateOptions{})
	}
	
	if err != nil {
		klog.ErrorS(err, "Failed to update resource")
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handleCreateResource(c *gin.Context) {
	dynamicClient, err := setupMemberClient(c)
	if err != nil {
		common.Fail(c, err)
		return
	}

	kind := c.Param("kind")
	namespace := c.Param("namespace")

	var obj *unstructured.Unstructured
	if err := c.ShouldBindJSON(&obj); err != nil {
		klog.ErrorS(err, "Failed to bind JSON")
		common.Fail(c, err)
		return
	}

	gvr := getGroupVersionResource(kind)
	
	var result *unstructured.Unstructured
	
	if isClusterScopedResource(kind) {
		// Handle cluster-scoped resources without namespace
		result, err = dynamicClient.Resource(gvr).Create(context.Background(), obj, metav1.CreateOptions{})
	} else {
		// Handle namespaced resources
		result, err = dynamicClient.Resource(gvr).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
	}
	
	if err != nil {
		klog.ErrorS(err, "Failed to create resource")
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func init() {
	r := router.MemberV1()
	r.DELETE("/_raw/:kind/:namespace/:name", handleDeleteResource)
	r.GET("/_raw/:kind/:namespace/:name", handleGetResource)
	r.PUT("/_raw/:kind/:namespace/:name", handlePutResource)
	r.POST("/_raw/:kind/:namespace", handleCreateResource)
	
	// Add routes for cluster-scoped resources
	r.DELETE("/_raw/:kind/name/:name", handleDeleteResource)
	r.GET("/_raw/:kind/name/:name", handleGetResource)
	r.PUT("/_raw/:kind/name/:name", handlePutResource)
	r.POST("/_raw/:kind", handleCreateResource)
}
