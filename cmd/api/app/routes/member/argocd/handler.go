package argocd

import (
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

func init() {
	r := router.MemberV1()
	r.GET("/argocd/project", handleGetMemberArgoProjects)
	r.GET("/argocd/project/:projectName", handleGetMemberArgoProject)
	r.GET("/argocd/application", handleGetMemberArgoApplications)
	r.GET("/argocd/applicationset", handleGetMemberArgoApplicationSets)
	r.GET("/argocd/application/:applicationName", handleGetMemberArgoApplicationDetail)

	// Add POST routes for creating ArgoCD resources
	r.POST("/argocd/project", handleCreateMemberArgoProject)
	r.POST("/argocd/application", handleCreateMemberArgoApplication)
	r.POST("/argocd/applicationset", handleCreateMemberArgoApplicationSet)

	// Add PUT routes for updating ArgoCD resources
	r.PUT("/argocd/project/:projectName", handleUpdateMemberArgoProject)
	r.PUT("/argocd/application/:applicationName", handleUpdateMemberArgoApplication)

	// Add DELETE routes for removing ArgoCD resources
	r.DELETE("/argocd/project/:projectName", handleDeleteMemberArgoProject)
	r.DELETE("/argocd/application/:applicationName", handleDeleteMemberArgoApplication)
	r.POST("/argocd/application/:applicationName/sync", handleSyncMemberArgoApplication)
}

var applicationGVR = schema.GroupVersionResource{
	Group:    "argoproj.io",
	Version:  "v1alpha1",
	Resource: "applications",
}

var applicationSetGVR = schema.GroupVersionResource{
	Group:    "argoproj.io",
	Version:  "v1alpha1",
	Resource: "applicationsets",
}

var projectGVR = schema.GroupVersionResource{
	Group:    "argoproj.io",
	Version:  "v1alpha1",
	Resource: "appprojects",
}

var argocdNamespace = "argocd"

// Resource kinds to include in the resource tree
var resourceKinds = []string{
	"Deployment",
	"StatefulSet",
	"DaemonSet",
	"ReplicaSet",
	"Pod",
	"Job",
	"CronJob",
	"Service",
	"Ingress",
	"ConfigMap",
	"Secret",
	"PersistentVolumeClaim",
}

// handleGetMemberArgoProjects handles GET requests for ArgoCD Projects in a specific member cluster
func handleGetMemberArgoProjects(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	projectList, err := dynamicClient.Resource(projectGVR).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list ArgoCD Projects", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// Add cluster information to each project
	for i := range projectList.Items {
		// Clean up metadata
		metadata := projectList.Items[i].Object["metadata"].(map[string]interface{})

		// Initialize labels if not present
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}

		// Add cluster information
		metadata["labels"].(map[string]interface{})["cluster"] = clusterName

		// Remove managedFields
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"items":      projectList.Items,
		"totalItems": len(projectList.Items),
	})
}

// handleGetMemberArgoApplications handles GET requests for ArgoCD Applications in a specific member cluster
func handleGetMemberArgoApplications(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	applicationList, err := dynamicClient.Resource(applicationGVR).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list ArgoCD Applications", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// Add cluster information to each application
	for i := range applicationList.Items {
		// Clean up metadata
		metadata := applicationList.Items[i].Object["metadata"].(map[string]interface{})

		// Initialize labels if not present
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}

		// Add cluster information
		metadata["labels"].(map[string]interface{})["cluster"] = clusterName

		// Remove managedFields
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"items":      applicationList.Items,
		"totalItems": len(applicationList.Items),
	})
}

// handleGetMemberArgoApplicationSets handles GET requests for ArgoCD ApplicationSets in a specific member cluster
func handleGetMemberArgoApplicationSets(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	applicationSetList, err := dynamicClient.Resource(applicationSetGVR).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list ArgoCD ApplicationSets", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// Add cluster information to each applicationSet
	for i := range applicationSetList.Items {
		// Clean up metadata
		metadata := applicationSetList.Items[i].Object["metadata"].(map[string]interface{})

		// Initialize labels if not present
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}

		// Add cluster information
		metadata["labels"].(map[string]interface{})["cluster"] = clusterName

		// Remove managedFields
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"items":      applicationSetList.Items,
		"totalItems": len(applicationSetList.Items),
	})
}

// handleGetMemberArgoProject handles GET requests to get detailed information about a specific ArgoCD Project
// including its applications in a member cluster
func handleGetMemberArgoProject(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	projectName := c.Param("projectName")
	if projectName == "" {
		common.Fail(c, fmt.Errorf("project name cannot be empty"))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the project details
	project, err := dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).Get(c, projectName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ArgoCD Project", "cluster", clusterName, "projectName", projectName)
		common.Fail(c, err)
		return
	}

	// Get all applications in this project
	applications, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list ArgoCD Applications", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// Filter applications that belong to this project
	projectApplications := make([]map[string]interface{}, 0)
	for _, app := range applications.Items {
		appSpec, ok := app.Object["spec"].(map[string]interface{})
		if !ok {
			continue
		}

		if appSpec["project"] == projectName {
			// Clean up metadata
			appMetadata := app.Object["metadata"].(map[string]interface{})
			if appMetadata["labels"] == nil {
				appMetadata["labels"] = make(map[string]interface{})
			}
			appMetadata["labels"].(map[string]interface{})["cluster"] = clusterName
			delete(appMetadata, "managedFields")

			projectApplications = append(projectApplications, app.Object)
		}
	}

	// Clean up project metadata
	projectMetadata := project.Object["metadata"].(map[string]interface{})
	if projectMetadata["labels"] == nil {
		projectMetadata["labels"] = make(map[string]interface{})
	}
	projectMetadata["labels"].(map[string]interface{})["cluster"] = clusterName
	delete(projectMetadata, "managedFields")

	// Prepare response with project details and its applications
	response := map[string]interface{}{
		"project":      project.Object,
		"applications": projectApplications,
	}

	common.Success(c, response)
}

// handleCreateMemberArgoProject handles POST requests to create ArgoCD Projects in a specific member cluster
func handleCreateMemberArgoProject(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	// Parse request body
	var projectData map[string]interface{}
	if err := c.ShouldBindJSON(&projectData); err != nil {
		common.Fail(c, fmt.Errorf("failed to parse request body: %w", err))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		common.Fail(c, fmt.Errorf("failed to create dynamic client: %w", err))
		return
	}

	// Ensure proper metadata
	if metadata, ok := projectData["metadata"].(map[string]interface{}); ok {
		// Add cluster information to labels
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}
		metadata["labels"].(map[string]interface{})["cluster"] = clusterName

		// Ensure namespace is set, default to "argocd" if not provided
		if metadata["namespace"] == nil {
			metadata["namespace"] = argocdNamespace
		}
	}

	// Set required API version and Kind for ArgoCD Project
	projectData["apiVersion"] = "argoproj.io/v1alpha1"
	projectData["kind"] = "AppProject"

	// Create the ArgoCD Project
	namespace := argocdNamespace
	if ns, ok := projectData["metadata"].(map[string]interface{})["namespace"].(string); ok && ns != "" {
		namespace = ns
	}

	result, err := dynamicClient.Resource(projectGVR).Namespace(namespace).Create(c, &unstructured.Unstructured{Object: projectData}, metav1.CreateOptions{})
	if err != nil {
		common.Fail(c, fmt.Errorf("failed to create ArgoCD Project: %w", err))
		return
	}

	common.Success(c, result)
}

// handleCreateMemberArgoApplication handles POST requests to create ArgoCD Applications in a specific member cluster
func handleCreateMemberArgoApplication(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	// Parse request body
	var applicationData map[string]interface{}
	if err := c.ShouldBindJSON(&applicationData); err != nil {
		common.Fail(c, fmt.Errorf("failed to parse request body: %w", err))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		common.Fail(c, fmt.Errorf("failed to create dynamic client: %w", err))
		return
	}

	// Ensure proper metadata
	if metadata, ok := applicationData["metadata"].(map[string]interface{}); ok {
		// Add cluster information to labels
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}
		metadata["labels"].(map[string]interface{})["cluster"] = clusterName

		// Ensure namespace is set, default to "argocd" if not provided
		if metadata["namespace"] == nil {
			metadata["namespace"] = argocdNamespace
		}
	}

	// Prepare the application
	application := &unstructured.Unstructured{
		Object: applicationData,
	}

	// Set required fields
	application.SetKind("Application")
	application.SetAPIVersion("argoproj.io/v1alpha1")

	// Create the application
	namespace := argocdNamespace
	if ns, ok := applicationData["metadata"].(map[string]interface{})["namespace"].(string); ok && ns != "" {
		namespace = ns
	}

	result, err := dynamicClient.Resource(applicationGVR).Namespace(namespace).Create(c, application, metav1.CreateOptions{})
	if err != nil {
		common.Fail(c, fmt.Errorf("failed to create ArgoCD Application: %w", err))
		return
	}

	common.Success(c, result)
}

// handleCreateMemberArgoApplicationSet handles POST requests to create ArgoCD ApplicationSets in a specific member cluster
func handleCreateMemberArgoApplicationSet(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	// Parse request body
	var applicationSetData map[string]interface{}
	if err := c.ShouldBindJSON(&applicationSetData); err != nil {
		common.Fail(c, fmt.Errorf("failed to parse request body: %w", err))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		common.Fail(c, fmt.Errorf("failed to create dynamic client: %w", err))
		return
	}

	// Ensure proper metadata
	if metadata, ok := applicationSetData["metadata"].(map[string]interface{}); ok {
		// Add cluster information to labels
		if metadata["labels"] == nil {
			metadata["labels"] = make(map[string]interface{})
		}
		metadata["labels"].(map[string]interface{})["cluster"] = clusterName

		// Ensure namespace is set, default to "argocd" if not provided
		if metadata["namespace"] == nil {
			metadata["namespace"] = argocdNamespace
		}
	}

	// Set required API version and Kind for ArgoCD ApplicationSet
	applicationSetData["apiVersion"] = "argoproj.io/v1alpha1"
	applicationSetData["kind"] = "ApplicationSet"

	// Create the ArgoCD ApplicationSet
	namespace := argocdNamespace
	if ns, ok := applicationSetData["metadata"].(map[string]interface{})["namespace"].(string); ok && ns != "" {
		namespace = ns
	}

	result, err := dynamicClient.Resource(applicationSetGVR).Namespace(namespace).Create(c, &unstructured.Unstructured{Object: applicationSetData}, metav1.CreateOptions{})
	if err != nil {
		common.Fail(c, fmt.Errorf("failed to create ArgoCD ApplicationSet: %w", err))
		return
	}

	common.Success(c, result)
}

// handleUpdateMemberArgoProject handles PUT requests to update ArgoCD Projects in a specific member cluster
func handleUpdateMemberArgoProject(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	projectName := c.Param("projectName")
	if projectName == "" {
		common.Fail(c, fmt.Errorf("project name cannot be empty"))
		return
	}

	// Parse request body
	var projectData map[string]interface{}
	if err := c.ShouldBindJSON(&projectData); err != nil {
		common.Fail(c, fmt.Errorf("failed to parse request body: %w", err))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the current project to update it
	currentProject, err := dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).Get(c, projectName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ArgoCD Project", "cluster", clusterName, "projectName", projectName)
		common.Fail(c, err)
		return
	}

	// Prepare the updated project
	updatedProject := &unstructured.Unstructured{
		Object: projectData,
	}

	// Ensure we keep the resource version
	metadata, ok := updatedProject.Object["metadata"].(map[string]interface{})
	if !ok {
		metadata = make(map[string]interface{})
		updatedProject.Object["metadata"] = metadata
	}

	// Set required fields
	updatedProject.SetKind("AppProject")
	updatedProject.SetAPIVersion("argoproj.io/v1alpha1")

	currentMetadata := currentProject.Object["metadata"].(map[string]interface{})
	metadata["resourceVersion"] = currentMetadata["resourceVersion"]
	metadata["name"] = projectName

	// Update the project
	result, err := dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).Update(c, updatedProject, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update ArgoCD Project", "cluster", clusterName, "projectName", projectName)
		common.Fail(c, err)
		return
	}

	// Clean up metadata
	resultMetadata := result.Object["metadata"].(map[string]interface{})

	// Initialize labels if not present
	if resultMetadata["labels"] == nil {
		resultMetadata["labels"] = make(map[string]interface{})
	}

	// Add cluster information
	resultMetadata["labels"].(map[string]interface{})["cluster"] = clusterName

	// Remove managedFields
	delete(resultMetadata, "managedFields")

	common.Success(c, result)
}

// handleDeleteMemberArgoProject handles DELETE requests to remove ArgoCD Projects from a specific member cluster
func handleDeleteMemberArgoProject(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	projectName := c.Param("projectName")
	if projectName == "" {
		common.Fail(c, fmt.Errorf("project name cannot be empty"))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	// Delete the project
	err = dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).Delete(c, projectName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete ArgoCD Project", "cluster", clusterName, "projectName", projectName)
		common.Fail(c, err)
		return
	}

	common.Success(c, gin.H{
		"message": fmt.Sprintf("Project %s deleted successfully", projectName),
	})
}

// handleUpdateMemberArgoApplication handles PUT requests to update ArgoCD Applications in a specific member cluster
func handleUpdateMemberArgoApplication(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	applicationName := c.Param("applicationName")
	if applicationName == "" {
		common.Fail(c, fmt.Errorf("application name cannot be empty"))
		return
	}

	// Parse request body
	var applicationData map[string]interface{}
	if err := c.ShouldBindJSON(&applicationData); err != nil {
		common.Fail(c, fmt.Errorf("failed to parse request body: %w", err))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the current application to update it
	currentApplication, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Get(c, applicationName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ArgoCD Application", "cluster", clusterName, "applicationName", applicationName)
		common.Fail(c, err)
		return
	}

	// Prepare the updated application
	updatedApplication := &unstructured.Unstructured{
		Object: applicationData,
	}

	// Ensure required fields are set
	updatedApplication.SetKind("Application")
	updatedApplication.SetAPIVersion("argoproj.io/v1alpha1")

	// Ensure we keep the resource version
	metadata, ok := updatedApplication.Object["metadata"].(map[string]interface{})
	if !ok {
		metadata = make(map[string]interface{})
		updatedApplication.Object["metadata"] = metadata
	}

	currentMetadata := currentApplication.Object["metadata"].(map[string]interface{})
	metadata["resourceVersion"] = currentMetadata["resourceVersion"]
	metadata["name"] = applicationName

	// Update the application
	result, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Update(c, updatedApplication, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update ArgoCD Application", "cluster", clusterName, "applicationName", applicationName)
		common.Fail(c, err)
		return
	}

	// Clean up metadata
	resultMetadata := result.Object["metadata"].(map[string]interface{})

	// Initialize labels if not present
	if resultMetadata["labels"] == nil {
		resultMetadata["labels"] = make(map[string]interface{})
	}

	// Add cluster information
	resultMetadata["labels"].(map[string]interface{})["cluster"] = clusterName

	// Remove managedFields
	delete(resultMetadata, "managedFields")

	common.Success(c, result)
}

// handleDeleteMemberArgoApplication handles DELETE requests to remove ArgoCD Applications from a specific member cluster
func handleDeleteMemberArgoApplication(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	applicationName := c.Param("applicationName")
	if applicationName == "" {
		common.Fail(c, fmt.Errorf("application name cannot be empty"))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	// Delete the application
	err = dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Delete(c, applicationName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete ArgoCD Application", "cluster", clusterName, "applicationName", applicationName)
		common.Fail(c, err)
		return
	}

	common.Success(c, gin.H{
		"message": fmt.Sprintf("Application %s deleted successfully", applicationName),
	})
}

// handleSyncMemberArgoApplication handles POST requests to sync an ArgoCD Application in a specific member cluster
func handleSyncMemberArgoApplication(c *gin.Context) {
	clusterName := c.Param("clustername")
	applicationName := c.Param("applicationName")

	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		c.JSON(400, gin.H{
			"code":    400,
			"message": fmt.Sprintf("failed to get dynamic client: %v", err),
		})
		return
	}

	var applicationGVR = schema.GroupVersionResource{
		Group:    "argoproj.io",
		Version:  "v1alpha1",
		Resource: "applications",
	}

	// Get the application first
	application, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Get(c, applicationName, metav1.GetOptions{})
	if err != nil {
		c.JSON(400, gin.H{
			"code":    400,
			"message": fmt.Sprintf("failed to get application: %v", err),
		})
		return
	}

	// Create a sync operation
	operation := map[string]interface{}{
		"operation": map[string]interface{}{
			"sync": map[string]interface{}{},
		},
	}

	// Update the application with the sync operation
	if err := unstructured.SetNestedField(application.Object, operation["operation"], "operation"); err != nil {
		c.JSON(400, gin.H{
			"code":    400,
			"message": fmt.Sprintf("failed to set sync operation: %v", err),
		})
		return
	}

	_, err = dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Update(c, application, metav1.UpdateOptions{})
	if err != nil {
		c.JSON(400, gin.H{
			"code":    400,
			"message": fmt.Sprintf("failed to sync application: %v", err),
		})
		return
	}

	c.JSON(200, gin.H{
		"code":    200,
		"message": "application sync started successfully",
	})
}

// handleGetMemberArgoApplicationDetail handles GET requests to get detailed information about a specific ArgoCD Application
// including its resource tree in a member cluster
func handleGetMemberArgoApplicationDetail(c *gin.Context) {
	clusterName := c.Param("clustername")
	if clusterName == "" {
		common.Fail(c, fmt.Errorf("cluster name cannot be empty"))
		return
	}

	applicationName := c.Param("applicationName")
	if applicationName == "" {
		common.Fail(c, fmt.Errorf("application name cannot be empty"))
		return
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the application details
	application, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Get(c, applicationName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ArgoCD Application", "cluster", clusterName, "applicationName", applicationName)
		common.Fail(c, err)
		return
	}

	// Clean up application metadata
	applicationMetadata := application.Object["metadata"].(map[string]interface{})
	if applicationMetadata["labels"] == nil {
		applicationMetadata["labels"] = make(map[string]interface{})
	}
	applicationMetadata["labels"].(map[string]interface{})["cluster"] = clusterName
	delete(applicationMetadata, "managedFields")

	// Get the resources associated with the application
	resources, err := getApplicationResources(c, dynamicClient, application)
	if err != nil {
		klog.ErrorS(err, "Failed to get resources for application", "cluster", clusterName, "applicationName", applicationName)
		common.Fail(c, err)
		return
	}

	// Build a resource tree based on owner references
	resourceTree := buildResourceTree(resources)

	// Prepare response with application details and its resource tree
	response := map[string]interface{}{
		"application": application.Object,
		"resources":   resourceTree,
	}

	common.Success(c, response)
}

// getApplicationResources retrieves all resources for an ArgoCD application
func getApplicationResources(c *gin.Context, dynamicClient dynamic.Interface, application *unstructured.Unstructured) ([]map[string]interface{}, error) {
	// Get application status which contains resources
	status, ok := application.Object["status"].(map[string]interface{})
	if !ok || status == nil {
		return nil, fmt.Errorf("application status not found or invalid")
	}

	// Get resources from application status
	resourcesRaw, ok := status["resources"].([]interface{})
	if !ok || resourcesRaw == nil {
		return nil, fmt.Errorf("no resources found in application status")
	}

	// Extract namespaces and resource kinds from application resources
	namespaceResourceMap := make(map[string]map[string]bool)
	for _, resourceRaw := range resourcesRaw {
		resource := resourceRaw.(map[string]interface{})
		namespace, hasNS := resource["namespace"].(string)
		kind, hasKind := resource["kind"].(string)

		if !hasKind {
			continue
		}

		if !hasNS || namespace == "" {
			namespace = "default"
		}

		if _, ok := namespaceResourceMap[namespace]; !ok {
			namespaceResourceMap[namespace] = make(map[string]bool)
		}
		namespaceResourceMap[namespace][kind] = true
	}

	// Collect all resources across relevant namespaces
	allResources := make([]map[string]interface{}, 0)

	// Add the original resources from the application status
	for _, resourceRaw := range resourcesRaw {
		resource := resourceRaw.(map[string]interface{})
		allResources = append(allResources, resource)
	}

	// Fetch additional resources for each namespace and kind
	for namespace, kinds := range namespaceResourceMap {
		// Fetch all relevant resource kinds
		for _, kind := range resourceKinds {
			if _, hasKind := kinds[kind]; hasKind || kind == "ReplicaSet" || kind == "Pod" {
				gvr := kindToGVR(kind)
				var resourceList *unstructured.UnstructuredList
				var err error

				if namespace == "" {
					// Cluster-scoped resources
					resourceList, err = dynamicClient.Resource(gvr).List(c, metav1.ListOptions{})
				} else {
					// Namespace-scoped resources
					resourceList, err = dynamicClient.Resource(gvr).Namespace(namespace).List(c, metav1.ListOptions{})
				}

				if err != nil {
					klog.ErrorS(err, "Failed to list resources", "kind", kind, "namespace", namespace)
					continue
				}

				// Add each resource to the collection
				for _, item := range resourceList.Items {
					// Skip if item type is ResourceList
					if item.GetKind() == "List" {
						continue
					}

					metadata, hasMetadata := item.Object["metadata"].(map[string]interface{})
					if !hasMetadata {
						continue
					}

					itemUID, hasUID := metadata["uid"].(string)
					if !hasUID {
						continue
					}

					itemName, hasName := metadata["name"].(string)
					if !hasName {
						continue
					}

					itemNamespace, _ := metadata["namespace"].(string)
					creationTimestamp, _ := metadata["creationTimestamp"].(string)

					// Extract resource status
					var resourceStatus string
					if kind == "Pod" {
						if status, ok := item.Object["status"].(map[string]interface{}); ok {
							if phase, ok := status["phase"].(string); ok {
								resourceStatus = phase
							}
						}
						
						// Add containers as children of the pod
						var containers []interface{}
						if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
							// Handle regular containers
							if podContainers, ok := spec["containers"].([]interface{}); ok {
								containers = append(containers, podContainers...)
							}
							
							// Handle init containers if present
							if initContainers, ok := spec["initContainers"].([]interface{}); ok {
								containers = append(containers, initContainers...)
							}
							
							// Handle ephemeral containers if present
							if ephemeralContainers, ok := spec["ephemeralContainers"].([]interface{}); ok {
								containers = append(containers, ephemeralContainers...)
							}
						}
						
						// Process each container and create a resource for it
						for _, c := range containers {
							container, ok := c.(map[string]interface{})
							if !ok {
								continue
							}
							
							containerName, ok := container["name"].(string)
							if !ok {
								continue
							}
							
							// Determine container status
							containerStatus := "Unknown"
							if status, ok := item.Object["status"].(map[string]interface{}); ok {
								if containerStatuses, ok := status["containerStatuses"].([]interface{}); ok {
									for _, cs := range containerStatuses {
										containerStat, ok := cs.(map[string]interface{})
										if !ok {
											continue
										}
										
										csName, ok := containerStat["name"].(string)
										if !ok || csName != containerName {
											continue
										}
										
										// Check ready status
										if ready, ok := containerStat["ready"].(bool); ok && ready {
											containerStatus = "Ready"
										}
										
										// Get more detailed status if available
										if state, ok := containerStat["state"].(map[string]interface{}); ok {
											if _, ok := state["running"]; ok {
												containerStatus = "Running"
											} else if _, ok := state["waiting"]; ok {
												containerStatus = "Waiting"
											} else if _, ok := state["terminated"]; ok {
												containerStatus = "Terminated"
											}
										}
									}
								}
							}
							
							// Generate a unique ID for the container
							containerUID := fmt.Sprintf("%s-container-%s", itemUID, containerName)
							
							// Create the container resource
							containerResource := map[string]interface{}{
								"uid":               containerUID,
								"kind":              "Container",
								"name":              containerName,
								"namespace":         itemNamespace,
								"status":            containerStatus,
								"creationTimestamp": creationTimestamp, // Use pod's creation time
								"ownerReferences": []map[string]interface{}{
									{
										"uid":  itemUID,
										"kind": "Pod",
										"name": itemName,
									},
								},
								"children": []interface{}{},
							}
							
							// Get container image
							if image, ok := container["image"].(string); ok {
								containerResource["image"] = image
							}
							
							// Add container ports if available
							if ports, ok := container["ports"].([]interface{}); ok && len(ports) > 0 {
								containerResource["ports"] = ports
							}
							
							allResources = append(allResources, containerResource)
						}
					} else if kind == "Deployment" || kind == "StatefulSet" || kind == "DaemonSet" {
						resourceStatus = "Unknown"
						if status, ok := item.Object["status"].(map[string]interface{}); ok {
							replicas, hasReplicas := status["replicas"]
							readyReplicas, hasReadyReplicas := status["readyReplicas"]

							if hasReplicas && hasReadyReplicas {
								if replicas == readyReplicas {
									resourceStatus = "Ready"
								} else {
									resourceStatus = "Progressing"
								}
							}
						}
					} else if kind == "Service" {
						resourceStatus = "Ready" // Services are typically ready once created
						if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
							if spec["type"] == "LoadBalancer" {
								// For LoadBalancer services, check if external IP is assigned
								if status, ok := item.Object["status"].(map[string]interface{}); ok {
									if ingress, ok := status["loadBalancer"].(map[string]interface{}); ok {
										if ingressList, ok := ingress["ingress"].([]interface{}); ok && len(ingressList) == 0 {
											resourceStatus = "Pending" // Waiting for external IP
										}
									}
								}
							}
						}
					} else if kind == "Ingress" {
						resourceStatus = "Ready" // Most ingresses are ready once created
						// Optional: check for specific status conditions if needed
					} else if kind == "Job" {
						resourceStatus = "Running"
						if status, ok := item.Object["status"].(map[string]interface{}); ok {
							if succeeded, ok := status["succeeded"].(int); ok && succeeded > 0 {
								resourceStatus = "Completed"
							} else if failed, ok := status["failed"].(int); ok && failed > 0 {
								resourceStatus = "Failed"
							}
						}
					} else if kind == "CronJob" {
						resourceStatus = "Ready" // CronJobs are typically ready once created
					} else if kind == "PersistentVolumeClaim" {
						resourceStatus = "Pending"
						if status, ok := item.Object["status"].(map[string]interface{}); ok {
							if phase, ok := status["phase"].(string); ok {
								resourceStatus = phase // Bound, Pending, etc.
							}
						}
					} else if kind == "ReplicaSet" {
						resourceStatus = "Unknown"
						if status, ok := item.Object["status"].(map[string]interface{}); ok {
							replicas, hasReplicas := status["replicas"]
							readyReplicas, hasReadyReplicas := status["readyReplicas"]

							if hasReplicas && hasReadyReplicas {
								if replicas == readyReplicas {
									resourceStatus = "Ready"
								} else {
									resourceStatus = "Progressing"
								}
							}
						}
					} else if kind == "ConfigMap" || kind == "Secret" {
						resourceStatus = "Ready" // These resources are ready once created
					} else if kind == "HorizontalPodAutoscaler" {
						resourceStatus = "Unknown"
						if status, ok := item.Object["status"].(map[string]interface{}); ok {
							if conditions, ok := status["conditions"].([]interface{}); ok && len(conditions) > 0 {
								for _, c := range conditions {
									condition, ok := c.(map[string]interface{})
									if !ok {
										continue
									}
									if conditionType, ok := condition["type"].(string); ok && conditionType == "ScalingActive" {
										if status, ok := condition["status"].(string); ok && status == "True" {
											resourceStatus = "Active"
										} else {
											resourceStatus = "Inactive"
										}
									}
								}
							}
						}
					} else {
						resourceStatus = "Unknown"
					}

					// Get the owner references for establishing relationships
					var ownerReferences []map[string]interface{}
					if metadataOwnerRefs, hasOwners := metadata["ownerReferences"].([]interface{}); hasOwners {
						for _, ownerRef := range metadataOwnerRefs {
							if owner, ok := ownerRef.(map[string]interface{}); ok {
								if ownerUID, hasUID := owner["uid"].(string); hasUID && ownerUID != "" {
									ownerKind, _ := owner["kind"].(string)
									ownerName, _ := owner["name"].(string)

									simplifiedOwner := map[string]interface{}{
										"uid":   ownerUID,
										"kind":  ownerKind,
										"name":  ownerName,
									}
									ownerReferences = append(ownerReferences, simplifiedOwner)
								}
							}
						}
					}

					// Create simplified resource map with only essential fields
					resource := map[string]interface{}{
						"kind":              kind,
						"name":              itemName,
						"namespace":         itemNamespace,
						"uid":               itemUID,
						"status":            resourceStatus,
						"creationTimestamp": creationTimestamp,
						"ownerReferences":   ownerReferences,
					}

					// Add health information where available
					if kind == "Pod" {
						if status, ok := item.Object["status"].(map[string]interface{}); ok {
							phase, ok := status["phase"].(string)
							if ok {
								health := map[string]interface{}{
									"status": mapPodPhaseToHealth(phase),
								}
								resource["health"] = health
							}
						}
					} else if kind == "Deployment" || kind == "StatefulSet" || kind == "DaemonSet" {
						if status, ok := item.Object["status"].(map[string]interface{}); ok {
							replicas, hasReplicas := status["replicas"]
							readyReplicas, hasReadyReplicas := status["readyReplicas"]

							if hasReplicas && hasReadyReplicas {
								if replicas == readyReplicas {
									health := map[string]interface{}{
										"status": "Healthy",
									}
									resource["health"] = health
								} else {
									health := map[string]interface{}{
										"status": "Progressing",
									}
									resource["health"] = health
								}
							}
						}
					}

					allResources = append(allResources, resource)
				}
			}
		}
	}

	return allResources, nil
}

// buildResourceTree constructs a hierarchical tree of resources based on owner references
func buildResourceTree(resources []map[string]interface{}) []map[string]interface{} {
	// Create a map from UID to resource for quick lookup
	resourceMap := make(map[string]map[string]interface{})
	for _, resource := range resources {
		uid, ok := resource["uid"].(string)
		if ok && uid != "" {
			// Create a copy of the resource to avoid modifying the original
			resourceCopy := make(map[string]interface{})
			for k, v := range resource {
				resourceCopy[k] = v
			}
			resourceMap[uid] = resourceCopy
		}
	}

	// Track whether a resource has a parent
	hasParent := make(map[string]bool)

	// Attach children to their parents based on owner references
	for _, resource := range resources {
		uid, hasUID := resource["uid"].(string)
		if !hasUID {
			continue
		}

		ownerReferences, hasOwners := resource["ownerReferences"].([]map[string]interface{})
		if !hasOwners || len(ownerReferences) == 0 {
			continue
		}

		for _, owner := range ownerReferences {
			ownerUID, hasUID := owner["uid"].(string)
			if !hasUID || ownerUID == "" {
				continue
			}

			// Skip self-references
			if ownerUID == uid {
				continue
			}

			// Find the parent resource
			parentResource, found := resourceMap[ownerUID]
			if found {
				// Initialize children array if not exists
				if _, hasChildren := parentResource["children"]; !hasChildren {
					parentResource["children"] = make([]map[string]interface{}, 0)
				}

				// Add this resource as a child of the parent
				children := parentResource["children"].([]map[string]interface{})
				children = append(children, resourceMap[uid])
				parentResource["children"] = children

				// Mark this resource as having a parent
				hasParent[uid] = true
			}
		}
	}

	// Collect root level resources (those without parents)
	rootResources := make([]map[string]interface{}, 0)
	for uid, resource := range resourceMap {
		if !hasParent[uid] {
			rootResources = append(rootResources, resource)
		}
	}

	return rootResources
}

// kindToGVR maps a Kubernetes resource kind to its GroupVersionResource
func kindToGVR(kind string) schema.GroupVersionResource {
	switch kind {
	case "Deployment":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	case "StatefulSet":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}
	case "DaemonSet":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}
	case "ReplicaSet":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "replicasets"}
	case "Pod":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	case "Service":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	case "Ingress":
		return schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}
	case "ConfigMap":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}
	case "Secret":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}
	case "PersistentVolumeClaim":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}
	case "Job":
		return schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "jobs"}
	case "CronJob":
		return schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "cronjobs"}
	default:
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: strings.ToLower(kind) + "s"}
	}
}

// mapPodPhaseToHealth converts Pod phase to health status
func mapPodPhaseToHealth(phase string) string {
	switch phase {
	case "Running":
		return "Healthy"
	case "Succeeded":
		return "Healthy"
	case "Pending":
		return "Progressing"
	case "Failed":
		return "Degraded"
	case "Unknown":
		return "Unknown"
	default:
		return "Unknown"
	}
}
