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
	"sort"
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

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

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
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

// handleGetClusterCRDs handles GET requests to list all CustomResourceDefinitions in a specific member cluster
func handleGetClusterCRDs(c *gin.Context) {
	// Get cluster name from path parameter
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name is required"))
		return
	}

	// Check if grouping by group is requested
	groupBy := c.Query("groupBy")

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, fmt.Errorf("failed to create dynamic client: %w", err))
		return
	}

	// Define the GVR for CustomResourceDefinitions
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	// List all CRDs in the member cluster
	crdList, err := dynamicClient.Resource(crdGVR).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list CRDs", "cluster", clusterName)
		common.Fail(c, fmt.Errorf("failed to list CRDs: %w", err))
		return
	}

	// Process CRDs 
	var allCRDs []unstructured.Unstructured
	groupedCRDs := make(map[string][]unstructured.Unstructured)

	// Add cluster information to each CRD's metadata and extract necessary info from spec
	for _, crd := range crdList.Items {
		// Clean up metadata
		metadata := crd.Object["metadata"].(map[string]interface{})
		
		// Initialize labels if not present
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}
		
		// Add cluster information
		metadata["labels"].(map[string]interface{})["cluster"] = clusterName

		// Remove managedFields
		delete(metadata, "managedFields")

		// Extract necessary fields from spec before cleaning it
		var group string
		if spec, ok := crd.Object["spec"].(map[string]interface{}); ok {
			// Extract and store group
			group = spec["group"].(string)
			// Store group in labels for later use
			metadata["labels"].(map[string]interface{})["group"] = group

			// Create simplified spec with only group and scope
			simplifiedSpec := map[string]interface{}{
				"group": group,
			}
			// Keep scope if present
			if scope, ok := spec["scope"].(string); ok {
				simplifiedSpec["scope"] = scope
			}
			// Replace full spec with simplified version
			crd.Object["spec"] = simplifiedSpec
		}

		// Extract acceptedNames from status before removing it
		if status, ok := crd.Object["status"].(map[string]interface{}); ok {
			if acceptedNames, ok := status["acceptedNames"].(map[string]interface{}); ok {
				// Store acceptedNames directly in the root object
				crd.Object["acceptedNames"] = acceptedNames
			}
			// Remove entire status field
			delete(crd.Object, "status")
		}

		if groupBy == "group" {
			// Group key is just the group since we're only dealing with a single cluster
			groupedCRDs[group] = append(groupedCRDs[group], crd)
		} else {
			allCRDs = append(allCRDs, crd)
		}
	}

	// Prepare response based on grouping
	if groupBy == "group" {
		// Sort groups for consistent ordering
		groups := make([]string, 0, len(groupedCRDs))
		for group := range groupedCRDs {
			groups = append(groups, group)
		}
		sort.Strings(groups)

		// Create sorted grouped response
		groupedResponse := make([]gin.H, 0, len(groups))
		totalItems := 0

		for _, group := range groups {
			crds := groupedCRDs[group]
			totalItems += len(crds)
			groupedResponse = append(groupedResponse, gin.H{
				"group":   group,
				"cluster": clusterName,
				"crds":    crds,
				"count":   len(crds),
			})
		}

		common.Success(c, gin.H{
			"groups":     groupedResponse,
			"totalItems": totalItems,
		})
	} else {
		common.Success(c, gin.H{
			"items":      allCRDs,
			"totalItems": len(allCRDs),
		})
	}
}

// handleGetCRDByName handles GET requests to get a specific CustomResourceDefinition by name in a member cluster
func handleGetCRDByName(c *gin.Context) {
	// Get cluster name and CRD name from path parameters
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name is required"))
		return
	}

	crdName := c.Param("crdname")
	if crdName == "" {
		common.Fail(c, fmt.Errorf("CRD name is required"))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, fmt.Errorf("failed to create dynamic client: %w", err))
		return
	}

	// Define the GVR for CustomResourceDefinitions
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	// Get the specific CRD by name
	crd, err := dynamicClient.Resource(crdGVR).Get(c, crdName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get CRD", "cluster", clusterName, "crd", crdName)
		common.Fail(c, fmt.Errorf("failed to get CRD %s: %w", crdName, err))
		return
	}

	// Clean up metadata
	metadata := crd.Object["metadata"].(map[string]interface{})
	
	// Initialize labels if not present
	if metadata["labels"] == nil {
		metadata["labels"] = make(map[string]interface{})
	}
	
	// Add cluster information
	metadata["labels"].(map[string]interface{})["cluster"] = clusterName

	// Remove managedFields
	delete(metadata, "managedFields")

	// Extract schema and validation information from the CRD
	// spec := crd.Object["spec"].(map[string]interface{})
	
	// Return the CRD with its spec, which includes the schema
	common.Success(c, gin.H{
		"crd": crd.Object,
	})
}

// handleUpdateCRD handles PUT requests to update a CustomResourceDefinition
func handleUpdateCRD(c *gin.Context) {
	// Get cluster name and CRD name from path parameters
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name is required"))
		return
	}

	crdName := c.Param("crdname")
	if crdName == "" {
		common.Fail(c, fmt.Errorf("CRD name is required"))
		return
	}

	// Parse the request body
	var crdData map[string]interface{}
	if err := c.ShouldBindJSON(&crdData); err != nil {
		klog.ErrorS(err, "Failed to bind JSON")
		common.Fail(c, fmt.Errorf("failed to parse request body: %w", err))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, fmt.Errorf("failed to create dynamic client: %w", err))
		return
	}

	// Define the GVR for CustomResourceDefinitions
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	// Clean up the object for update
	// Remove cluster label from metadata as it's not part of the original object
	if metadata, ok := crdData["metadata"].(map[string]interface{}); ok {
		if labels, ok := metadata["labels"].(map[string]interface{}); ok {
			delete(labels, "cluster")
		}
	}

	// Create unstructured object from the data
	obj := &unstructured.Unstructured{
		Object: crdData,
	}

	// Update the CRD
	updatedCrd, err := dynamicClient.Resource(crdGVR).Update(c, obj, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update CRD", "cluster", clusterName, "crd", crdName)
		common.Fail(c, fmt.Errorf("failed to update CRD %s: %w", crdName, err))
		return
	}

	// Clean up metadata for response
	metadata := updatedCrd.Object["metadata"].(map[string]interface{})
	
	// Initialize labels if not present
	if metadata["labels"] == nil {
		metadata["labels"] = make(map[string]interface{})
	}
	
	// Add cluster information
	metadata["labels"].(map[string]interface{})["cluster"] = clusterName

	// Remove managedFields
	delete(metadata, "managedFields")
	
	// Return the updated CRD
	common.Success(c, gin.H{
		"crd": updatedCrd.Object,
	})
}

func init() {
	r := router.MemberV1()
	r.GET("/customresource/resource", handleListCustomResourcesByGroupAndCRD)
	r.GET("/customresource/definition", handleGetClusterCRDs)
	r.GET("/customresource/definition/:crdname", handleGetCRDByName)
	r.PUT("/customresource/definition/:crdname", handleUpdateCRD)
}
