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

package customresource

import (
	"fmt"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
)

func handleGetCustomResourceDefinitions(c *gin.Context) {
	// Get member cluster config
	memberConfig, err := client.GetMemberConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get member config")
		common.Fail(c, fmt.Errorf("failed to get member config: %w", err))
		return
	}

	karmadaConfig, _, err := client.GetKarmadaConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get karmada config")
		common.Fail(c, fmt.Errorf("failed to get karmada config: %w", err))
		return
	}

	clusterName := c.Param("clustername")

	// Set up member cluster proxy URL
	memberConfig.Host = karmadaConfig.Host + fmt.Sprintf("/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy/", clusterName)
	klog.V(4).InfoS("Using member config", "host", memberConfig.Host)

	// Create dynamic client
	dynamicClient, err := dynamic.NewForConfig(memberConfig)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, fmt.Errorf("failed to create dynamic client: %w", err))
		return
	}

	// Get group name from path parameter
	groupName := c.Param("groupname")

	// Create GVR for CRDs
	gvr := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	// List all CRDs
	list, err := dynamicClient.Resource(gvr).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list CRDs", "cluster", clusterName)
		common.Fail(c, fmt.Errorf("failed to list CRDs: %w", err))
		return
	}

	// Filter CRDs by group
	filteredList := list.DeepCopy()
	filteredList.Items = nil

	for _, crd := range list.Items {
		spec, ok := crd.Object["spec"].(map[string]interface{})
		if !ok {
			continue
		}
		group, ok := spec["group"].(string)
		if !ok {
			continue
		}
		if group == groupName {
			filteredList.Items = append(filteredList.Items, crd)
		}
	}

	common.Success(c, filteredList)
}

func handleGetCustomResources(c *gin.Context) {
	// Get member cluster config
	memberConfig, err := client.GetMemberConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get member config")
		common.Fail(c, fmt.Errorf("failed to get member config: %w", err))
		return
	}

	karmadaConfig, _, err := client.GetKarmadaConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get karmada config")
		common.Fail(c, fmt.Errorf("failed to get karmada config: %w", err))
		return
	}

	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name is required"))
		return
	}

	// Set up member cluster proxy URL with the correct format
	memberConfig.Host = fmt.Sprintf("%s/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy", karmadaConfig.Host, clusterName)
	klog.V(4).InfoS("Using member config", "host", memberConfig.Host)

	// Create dynamic client
	dynamicClient, err := dynamic.NewForConfig(memberConfig)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, fmt.Errorf("failed to create dynamic client: %w", err))
		return
	}

	// Get resource definition from path parameter
	resourceDefinition := c.Param("resourcedefinition")
	namespaceQuery := common.ParseNamespacePathParameter(c)

	// Parse the resource definition into group, version, and resource
	gv, err := schema.ParseGroupVersion(resourceDefinition)
	if err != nil {
		klog.ErrorS(err, "Failed to parse group version")
		common.Fail(c, fmt.Errorf("failed to parse group version: %w", err))
		return
	}

	gvr := schema.GroupVersionResource{
		Group:    gv.Group,
		Version:  gv.Version,
		Resource: c.Query("resource"), // Get the resource type from query parameter
	}

	// List custom resources
	var list interface{}
	namespace := namespaceQuery.ToRequestParam()
	if namespace == "" {
		list, err = dynamicClient.Resource(gvr).List(c, metav1.ListOptions{})
	} else {
		list, err = dynamicClient.Resource(gvr).Namespace(namespace).List(c, metav1.ListOptions{})
	}

	if err != nil {
		klog.ErrorS(err, "Failed to list custom resources", "cluster", clusterName)
		common.Fail(c, fmt.Errorf("failed to list custom resources: %w", err))
		return
	}

	common.Success(c, list)
}

// handleListCustomResourcesByGroupAndCRD handles GET requests for custom resources filtered by group and CRD name
func handleListCustomResourcesByGroupAndCRD(c *gin.Context) {
	// Get query parameters
	group := c.Query("group")
	crd := c.Query("crd")
	if group == "" || crd == "" {
		common.Fail(c, fmt.Errorf("group and crd query parameters are required"))
		return
	}

	// Get cluster name from path parameter
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name is required"))
		return
	}

	// Get member cluster config
	memberConfig, err := client.GetMemberConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get member config")
		common.Fail(c, err)
		return
	}

	karmadaConfig, _, err := client.GetKarmadaConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get karmada config")
		common.Fail(c, err)
		return
	}

	// Set up member cluster proxy URL
	memberConfig.Host = fmt.Sprintf("%s/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy", karmadaConfig.Host, clusterName)
	klog.V(4).InfoS("Using member config", "host", memberConfig.Host)

	// Create dynamic client
	dynamicClient, err := dynamic.NewForConfig(memberConfig)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	// Get CRD to find API version and kind
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	crdObj, err := dynamicClient.Resource(crdGVR).Get(c, crd, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get CRD", "crd", crd)
		common.Fail(c, err)
		return
	}

	// Extract version and plural name from CRD
	spec := crdObj.Object["spec"].(map[string]interface{})
	versions := spec["versions"].([]interface{})
	if len(versions) == 0 {
		common.Fail(c, fmt.Errorf("no versions found in CRD"))
		return
	}
	version := versions[0].(map[string]interface{})["name"].(string)
	plural := spec["names"].(map[string]interface{})["plural"].(string)

	// Create GVR for the custom resource
	resourceGVR := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: plural,
	}

	// List custom resources
	resourceList, err := dynamicClient.Resource(resourceGVR).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list custom resources", "group", group, "version", version, "plural", plural)
		common.Fail(c, err)
		return
	}

	common.Success(c, gin.H{
		"items":      resourceList.Items,
		"totalItems": len(resourceList.Items),
	})
}

func init() {
	r := router.MemberV1()
	r.GET("/customresource/resource/:resourcedefinition", handleGetCustomResources)
	r.GET("/customresource/definition/:groupname", handleGetCustomResourceDefinitions)
	r.GET("/customresource/resource", handleListCustomResourcesByGroupAndCRD)
}
