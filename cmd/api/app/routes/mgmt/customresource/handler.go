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
	"context"
	"fmt"
	"sort"

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

// createDynamicClient returns a dynamic client for the management cluster
func createDynamicClient() (dynamic.Interface, error) {
	return client.GetDynamicClient()
}

// CRD is a CustomResourceDefinition resource that can be used to list resources and perform operations on them.
type CRD struct {
	Group    string
	Version  string
	Name     string
	Singular string
	Plural   string
	Kind     string
	Scope    string
}

// HandleListMgmtCustomResourcesByGroupAndCRD handles GET requests for custom resources filtered by group and CRD name
func HandleListMgmtCustomResourcesByGroupAndCRD(c *gin.Context) {
	// Get query parameters
	group := c.Query("group")
	crd := c.Query("crd")
	if group == "" || crd == "" {
		klog.Error("Group and CRD query parameters are required")
		common.Fail(c, errors.NewBadRequest("group and crd query parameters are required"))
		return
	}

	// Create a dynamic client for the management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Define GVR for CustomResourceDefinitions
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	klog.InfoS("Getting CRD in management cluster", "crd", crd)

	crdObj, err := dynamicClient.Resource(crdGVR).Get(context.TODO(), crd, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get CRD", "crd", crd)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to get CRD: %v", err)))
		return
	}

	// Extract version, plural, and kind from the CRD
	spec := crdObj.Object["spec"].(map[string]interface{})
	names := spec["names"].(map[string]interface{})
	plural := names["plural"].(string)

	// Extract the first version
	versions := spec["versions"].([]interface{})
	if len(versions) == 0 {
		klog.Error("CRD has no versions", "crd", crd)
		common.Fail(c, errors.NewInternal("CRD has no versions"))
		return
	}

	// Use the first version
	version := versions[0].(map[string]interface{})["name"].(string)

	// Define GVR for the custom resource
	resourceGVR := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: plural,
	}

	klog.InfoS("Listing custom resources in management cluster",
		"group", group, "version", version, "resource", plural)

	// List custom resources
	resourceList, err := dynamicClient.Resource(resourceGVR).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list custom resources",
			"group", group, "version", version, "plural", plural)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to list custom resources: %v", err)))
		return
	}

	// Process each resource to add management cluster info
	for i := range resourceList.Items {
		// Clean up metadata
		metadata := resourceList.Items[i].Object["metadata"].(map[string]interface{})

		// Initialize labels if not present
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}

		// Add management cluster indicator
		metadata["labels"].(map[string]interface{})["isManagementCluster"] = "true"

		// Remove managedFields to reduce payload size
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"resources":      resourceList.Items,
		"totalResources": len(resourceList.Items),
	})
}

// HandleGetMgmtClusterCRDs handles GET requests to list all CustomResourceDefinitions in the management cluster
func HandleGetMgmtClusterCRDs(c *gin.Context) {
	// Check if grouping by group is requested
	groupBy := c.Query("groupBy")

	// Create a dynamic client for the management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Define GVR for CustomResourceDefinitions
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	klog.InfoS("Listing CRDs in management cluster")

	// List CRDs
	crdList, err := dynamicClient.Resource(crdGVR).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list CRDs")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to list CRDs: %v", err)))
		return
	}

	// Process CRDs
	var allCRDs []unstructured.Unstructured
	groupedCRDs := make(map[string][]unstructured.Unstructured)

	// Process each CRD in the response
	for _, crd := range crdList.Items {
		// Clean up metadata
		metadata := crd.Object["metadata"].(map[string]interface{})

		// Initialize labels if not present
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}

		// Add management cluster indicator
		metadata["labels"].(map[string]interface{})["isManagementCluster"] = "true"

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
			// Group by the group
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

		// Create an array of group objects in the exact format expected
		groupsArray := make([]map[string]interface{}, 0, len(groups))
		for _, group := range groups {
			groupsArray = append(groupsArray, map[string]interface{}{
				"cluster": "mgmt-cluster", // Use 'mgmt-cluster' to identify this is from management cluster
				"count":   len(groupedCRDs[group]),
				"crds":    groupedCRDs[group],
				"group":   group, // Include the group name as required
			})
		}

		common.Success(c, gin.H{
			"groups":      groupsArray,
			"totalGroups": len(groups),
			"totalCRDs":   len(crdList.Items),
		})
	} else {
		// Return flat list of all CRDs in expected format
		common.Success(c, gin.H{
			"crds":      allCRDs,
			"totalCrds": len(allCRDs),
		})
	}
}

// HandleGetMgmtCRDByName handles GET requests to get a specific CustomResourceDefinition by name
func HandleGetMgmtCRDByName(c *gin.Context) {
	crdName := c.Param("crdName")
	if crdName == "" {
		klog.Error("CRD name is required")
		common.Fail(c, errors.NewBadRequest("CRD name is required"))
		return
	}

	// Create a dynamic client for the management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Define GVR for CustomResourceDefinitions
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	klog.InfoS("Getting CRD in management cluster", "crd", crdName)

	// Get the CRD
	crd, err := dynamicClient.Resource(crdGVR).Get(context.TODO(), crdName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get CRD", "crd", crdName)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to get CRD: %v", err)))
		return
	}

	// Add management cluster metadata to the result
	crd.SetAnnotations(map[string]string{
		"cluster": "mgmt-cluster",
	})

	common.Success(c, crd)
}

// HandleUpdateMgmtCRD handles PUT requests to update a CustomResourceDefinition
func HandleUpdateMgmtCRD(c *gin.Context) {
	crdName := c.Param("crdName")
	if crdName == "" {
		klog.Error("CRD name is required")
		common.Fail(c, errors.NewBadRequest("CRD name is required"))
		return
	}

	// Parse request body
	var crdData map[string]interface{}
	if err := c.BindJSON(&crdData); err != nil {
		klog.ErrorS(err, "Failed to parse request body")
		common.Fail(c, errors.NewBadRequest(fmt.Sprintf("Failed to parse request body: %v", err)))
		return
	}

	// Create a dynamic client for the management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Define GVR for CustomResourceDefinitions
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	// Create the unstructured object
	crd := &unstructured.Unstructured{
		Object: crdData,
	}

	klog.InfoS("Updating CRD in management cluster", "crd", crdName)

	// Update the CRD
	result, err := dynamicClient.Resource(crdGVR).Update(c, crd, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update CRD", "crd", crdName)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to update CRD: %v", err)))
		return
	}

	common.Success(c, result)
}

// HandleGetMgmtCustomResources handles GET requests for custom resources with query parameters for group and crd
func HandleGetMgmtCustomResources(c *gin.Context) {
	// Get query parameters
	group := c.Query("group")
	crd := c.Query("crd")
	if group == "" || crd == "" {
		klog.Error("Group and CRD query parameters are required")
		common.Fail(c, errors.NewBadRequest("group and crd query parameters are required"))
		return
	}

	// Create a dynamic client for the management cluster
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Define GVR for CustomResourceDefinitions
	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	klog.InfoS("Getting CRD in management cluster", "crd", crd)

	crdObj, err := dynamicClient.Resource(crdGVR).Get(context.TODO(), crd, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get CRD", "crd", crd)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to get CRD: %v", err)))
		return
	}

	// Extract version, plural, and kind from the CRD
	spec := crdObj.Object["spec"].(map[string]interface{})
	names := spec["names"].(map[string]interface{})
	plural := names["plural"].(string)

	// Extract the first version
	versions := spec["versions"].([]interface{})
	if len(versions) == 0 {
		klog.Error("CRD has no versions", "crd", crd)
		common.Fail(c, errors.NewInternal("CRD has no versions"))
		return
	}

	// Use the first version
	version := versions[0].(map[string]interface{})["name"].(string)

	// Define GVR for the custom resource
	resourceGVR := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: plural,
	}

	klog.InfoS("Listing custom resources in management cluster",
		"group", group, "version", version, "resource", plural)

	// List custom resources
	resourceList, err := dynamicClient.Resource(resourceGVR).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list custom resources",
			"group", group, "version", version, "plural", plural)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to list custom resources: %v", err)))
		return
	}

	// Process each resource to add management cluster info
	for i := range resourceList.Items {
		// Clean up metadata
		metadata := resourceList.Items[i].Object["metadata"].(map[string]interface{})

		// Initialize labels if not present
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}

		// Add management cluster indicator
		metadata["labels"].(map[string]interface{})["isManagementCluster"] = "true"
		metadata["labels"].(map[string]interface{})["cluster"] = "mgmt-cluster"

		// Remove managedFields to reduce payload size
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"items":      resourceList.Items,
		"totalItems": len(resourceList.Items),
	})
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/customresource", HandleListMgmtCustomResourcesByGroupAndCRD)
		mgmtRouter.GET("/customresource/definition", HandleGetMgmtClusterCRDs)
		mgmtRouter.GET("/customresource/definition/:crdName", HandleGetMgmtCRDByName)
		mgmtRouter.PUT("/customresource/definition/:crdName", HandleUpdateMgmtCRD)
		mgmtRouter.GET("/customresource/resource", HandleGetMgmtCustomResources)
	}
	klog.InfoS("Registered management cluster custom resource routes")
}
