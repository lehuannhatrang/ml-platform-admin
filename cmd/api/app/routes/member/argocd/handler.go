package argocd

import (
	"fmt"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
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
