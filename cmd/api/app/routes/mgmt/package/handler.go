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

package packagemgmt

import (
	"context"
	"fmt"

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

// Constants for the custom resources
const (
	GroupName        = "config.porch.kpt.dev"
	VersionName      = "v1alpha1"
	RepositoryPlural = "repositories"
	PackageRevPlural = "packagerevs"
	RepositoryKind   = "Repository"
	PackageRevKind   = "PackageRev"
)

// createDynamicClient returns a dynamic client for the management cluster
func createDynamicClient() (dynamic.Interface, error) {
	return client.GetDynamicClient()
}

// getRepositoryGVR returns the GroupVersionResource for Repository custom resource
func getRepositoryGVR() schema.GroupVersionResource {
	return schema.GroupVersionResource{
		Group:    GroupName,
		Version:  VersionName,
		Resource: RepositoryPlural,
	}
}

// getPackageRevGVR returns the GroupVersionResource for PackageRev custom resource
func getPackageRevGVR() schema.GroupVersionResource {
	return schema.GroupVersionResource{
		Group:    GroupName,
		Version:  VersionName,
		Resource: PackageRevPlural,
	}
}

// HandleListRepositories handles GET requests to list all Repository resources
func HandleListRepositories(c *gin.Context) {
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for Repository resource
	gvr := getRepositoryGVR()

	klog.InfoS("Listing Repository resources in management cluster")

	// List Repository resources in the default namespace
	resourceList, err := dynamicClient.Resource(gvr).Namespace("default").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list Repository resources", "namespace", "default")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to list Repository resources: %v", err)))
		return
	}

	// Process each resource to clean up metadata
	for i := range resourceList.Items {
		// Clean up metadata
		metadata := resourceList.Items[i].Object["metadata"].(map[string]interface{})

		// Remove managedFields to reduce payload size
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"resources":      resourceList.Items,
		"totalResources": len(resourceList.Items),
	})
}

// HandleGetRepository handles GET requests to get a specific Repository by name
func HandleGetRepository(c *gin.Context) {
	// Get name parameter from URL
	name := c.Param("name")
	if name == "" {
		klog.Error("Repository name is required")
		common.Fail(c, errors.NewBadRequest("repository name is required"))
		return
	}

	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for Repository resource
	gvr := getRepositoryGVR()

	klog.InfoS("Getting Repository resource in management cluster", "name", name)

	// Get Repository resource in the default namespace
	resource, err := dynamicClient.Resource(gvr).Namespace("default").Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get Repository resource", "name", name, "namespace", "default")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to get Repository resource: %v", err)))
		return
	}

	// Clean up metadata
	metadata := resource.Object["metadata"].(map[string]interface{})

	// Remove managedFields to reduce payload size
	delete(metadata, "managedFields")

	common.Success(c, resource.Object)
}

// HandleCreateRepository handles POST requests to create a new Repository resource
func HandleCreateRepository(c *gin.Context) {
	// Parse request body
	var requestBody map[string]interface{}
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		klog.ErrorS(err, "Failed to parse request body")
		common.Fail(c, errors.NewBadRequest(fmt.Sprintf("Failed to parse request body: %v", err)))
		return
	}

	// Create a new unstructured object with the request body
	obj := &unstructured.Unstructured{
		Object: requestBody,
	}

	// Set the apiVersion and kind if not already set
	if obj.GetAPIVersion() == "" {
		obj.SetAPIVersion(fmt.Sprintf("%s/%s", GroupName, VersionName))
	}
	if obj.GetKind() == "" {
		obj.SetKind(RepositoryKind)
	}

	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for Repository resource
	gvr := getRepositoryGVR()

	klog.InfoS("Creating Repository resource in management cluster", "name", obj.GetName())

	// Create Repository resource
	createdObj, err := dynamicClient.Resource(gvr).Create(context.TODO(), obj, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create Repository resource")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create Repository resource: %v", err)))
		return
	}

	// Clean up metadata
	metadata := createdObj.Object["metadata"].(map[string]interface{})

	// Remove managedFields to reduce payload size
	delete(metadata, "managedFields")

	common.Success(c, createdObj.Object)
}

// HandleUpdateRepository handles PUT requests to update an existing Repository resource
func HandleUpdateRepository(c *gin.Context) {
	// Get name parameter from URL
	name := c.Param("name")
	if name == "" {
		klog.Error("Repository name is required")
		common.Fail(c, errors.NewBadRequest("repository name is required"))
		return
	}

	// Parse request body
	var requestBody map[string]interface{}
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		klog.ErrorS(err, "Failed to parse request body")
		common.Fail(c, errors.NewBadRequest(fmt.Sprintf("Failed to parse request body: %v", err)))
		return
	}

	// Create a new unstructured object with the request body
	obj := &unstructured.Unstructured{
		Object: requestBody,
	}

	// Set the apiVersion and kind if not already set
	if obj.GetAPIVersion() == "" {
		obj.SetAPIVersion(fmt.Sprintf("%s/%s", GroupName, VersionName))
	}
	if obj.GetKind() == "" {
		obj.SetKind(RepositoryKind)
	}

	// Ensure the name in the URL matches the name in the object
	if obj.GetName() != name {
		klog.Error("Repository name in URL does not match name in request body")
		common.Fail(c, errors.NewBadRequest("repository name in URL does not match name in request body"))
		return
	}

	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for Repository resource
	gvr := getRepositoryGVR()

	klog.InfoS("Updating Repository resource in management cluster", "name", name)

	// Update Repository resource
	updatedObj, err := dynamicClient.Resource(gvr).Update(context.TODO(), obj, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update Repository resource", "name", name)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to update Repository resource: %v", err)))
		return
	}

	// Clean up metadata
	metadata := updatedObj.Object["metadata"].(map[string]interface{})

	// Remove managedFields to reduce payload size
	delete(metadata, "managedFields")

	common.Success(c, updatedObj.Object)
}

// HandleDeleteRepository handles DELETE requests to delete a Repository resource
func HandleDeleteRepository(c *gin.Context) {
	// Get name parameter from URL
	name := c.Param("name")
	if name == "" {
		klog.Error("Repository name is required")
		common.Fail(c, errors.NewBadRequest("repository name is required"))
		return
	}

	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for Repository resource
	gvr := getRepositoryGVR()

	klog.InfoS("Deleting Repository resource in management cluster", "name", name)

	// Delete Repository resource
	err = dynamicClient.Resource(gvr).Delete(context.TODO(), name, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete Repository resource", "name", name)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to delete Repository resource: %v", err)))
		return
	}

	common.Success(c, gin.H{
		"message": fmt.Sprintf("Repository '%s' deleted successfully", name),
	})
}

// HandleListPackageRevs handles GET requests to list all PackageRev resources
func HandleListPackageRevs(c *gin.Context) {
	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for PackageRev resource
	gvr := getPackageRevGVR()

	klog.InfoS("Listing PackageRev resources in management cluster")

	// List PackageRev resources
	resourceList, err := dynamicClient.Resource(gvr).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list PackageRev resources")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to list PackageRev resources: %v", err)))
		return
	}

	// Process each resource to clean up metadata
	for i := range resourceList.Items {
		// Clean up metadata
		metadata := resourceList.Items[i].Object["metadata"].(map[string]interface{})

		// Remove managedFields to reduce payload size
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"resources":      resourceList.Items,
		"totalResources": len(resourceList.Items),
	})
}

// HandleGetPackageRev handles GET requests to get a specific PackageRev by name
func HandleGetPackageRev(c *gin.Context) {
	// Get name parameter from URL
	name := c.Param("name")
	if name == "" {
		klog.Error("PackageRev name is required")
		common.Fail(c, errors.NewBadRequest("packagerev name is required"))
		return
	}

	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for PackageRev resource
	gvr := getPackageRevGVR()

	klog.InfoS("Getting PackageRev resource in management cluster", "name", name)

	// Get PackageRev resource
	resource, err := dynamicClient.Resource(gvr).Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get PackageRev resource", "name", name)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to get PackageRev resource: %v", err)))
		return
	}

	// Clean up metadata
	metadata := resource.Object["metadata"].(map[string]interface{})

	// Remove managedFields to reduce payload size
	delete(metadata, "managedFields")

	common.Success(c, resource.Object)
}

// HandleCreatePackageRev handles POST requests to create a new PackageRev resource
func HandleCreatePackageRev(c *gin.Context) {
	// Parse request body
	var requestBody map[string]interface{}
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		klog.ErrorS(err, "Failed to parse request body")
		common.Fail(c, errors.NewBadRequest(fmt.Sprintf("Failed to parse request body: %v", err)))
		return
	}

	// Create a new unstructured object with the request body
	obj := &unstructured.Unstructured{
		Object: requestBody,
	}

	// Set the apiVersion and kind if not already set
	if obj.GetAPIVersion() == "" {
		obj.SetAPIVersion(fmt.Sprintf("%s/%s", GroupName, VersionName))
	}
	if obj.GetKind() == "" {
		obj.SetKind(PackageRevKind)
	}

	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for PackageRev resource
	gvr := getPackageRevGVR()

	klog.InfoS("Creating PackageRev resource in management cluster", "name", obj.GetName())

	// Create PackageRev resource
	createdObj, err := dynamicClient.Resource(gvr).Create(context.TODO(), obj, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create PackageRev resource")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create PackageRev resource: %v", err)))
		return
	}

	// Clean up metadata
	metadata := createdObj.Object["metadata"].(map[string]interface{})

	// Remove managedFields to reduce payload size
	delete(metadata, "managedFields")

	common.Success(c, createdObj.Object)
}

// HandleUpdatePackageRev handles PUT requests to update an existing PackageRev resource
func HandleUpdatePackageRev(c *gin.Context) {
	// Get name parameter from URL
	name := c.Param("name")
	if name == "" {
		klog.Error("PackageRev name is required")
		common.Fail(c, errors.NewBadRequest("packagerev name is required"))
		return
	}

	// Parse request body
	var requestBody map[string]interface{}
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		klog.ErrorS(err, "Failed to parse request body")
		common.Fail(c, errors.NewBadRequest(fmt.Sprintf("Failed to parse request body: %v", err)))
		return
	}

	// Create a new unstructured object with the request body
	obj := &unstructured.Unstructured{
		Object: requestBody,
	}

	// Set the apiVersion and kind if not already set
	if obj.GetAPIVersion() == "" {
		obj.SetAPIVersion(fmt.Sprintf("%s/%s", GroupName, VersionName))
	}
	if obj.GetKind() == "" {
		obj.SetKind(PackageRevKind)
	}

	// Ensure the name in the URL matches the name in the object
	if obj.GetName() != name {
		klog.Error("PackageRev name in URL does not match name in request body")
		common.Fail(c, errors.NewBadRequest("packagerev name in URL does not match name in request body"))
		return
	}

	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for PackageRev resource
	gvr := getPackageRevGVR()

	klog.InfoS("Updating PackageRev resource in management cluster", "name", name)

	// Update PackageRev resource
	updatedObj, err := dynamicClient.Resource(gvr).Update(context.TODO(), obj, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update PackageRev resource", "name", name)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to update PackageRev resource: %v", err)))
		return
	}

	// Clean up metadata
	metadata := updatedObj.Object["metadata"].(map[string]interface{})

	// Remove managedFields to reduce payload size
	delete(metadata, "managedFields")

	common.Success(c, updatedObj.Object)
}

// HandleDeletePackageRev handles DELETE requests to delete a PackageRev resource
func HandleDeletePackageRev(c *gin.Context) {
	// Get name parameter from URL
	name := c.Param("name")
	if name == "" {
		klog.Error("PackageRev name is required")
		common.Fail(c, errors.NewBadRequest("packagerev name is required"))
		return
	}

	dynamicClient, err := createDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create dynamic client: %v", err)))
		return
	}

	// Get the GVR for PackageRev resource
	gvr := getPackageRevGVR()

	klog.InfoS("Deleting PackageRev resource in management cluster", "name", name)

	// Delete PackageRev resource
	err = dynamicClient.Resource(gvr).Delete(context.TODO(), name, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete PackageRev resource", "name", name)
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to delete PackageRev resource: %v", err)))
		return
	}

	common.Success(c, gin.H{
		"message": fmt.Sprintf("PackageRev '%s' deleted successfully", name),
	})
}

// init registers all routes for package management
func init() {
	mgmtRouter := router.Mgmt()
	{
		// Register Repository routes
		mgmtRouter.GET("/package/repository", HandleListRepositories)
		mgmtRouter.GET("/package/repository/:name", HandleGetRepository)
		mgmtRouter.POST("/package/repository", HandleCreateRepository)
		mgmtRouter.PUT("/package/repository/:name", HandleUpdateRepository)
		mgmtRouter.DELETE("/package/repository/:name", HandleDeleteRepository)

		// Register PackageRev routes
		mgmtRouter.GET("/package/packagerev", HandleListPackageRevs)
		mgmtRouter.GET("/package/packagerev/:name", HandleGetPackageRev)
		mgmtRouter.POST("/package/packagerev", HandleCreatePackageRev)
		mgmtRouter.PUT("/package/packagerev/:name", HandleUpdatePackageRev)
		mgmtRouter.DELETE("/package/packagerev/:name", HandleDeletePackageRev)
	}
	klog.InfoS("Registered package management routes for Repository and PackageRev resources")
}