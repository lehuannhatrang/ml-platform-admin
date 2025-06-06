package argocd

import (
	"fmt"
	"time"

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
	r := router.Mgmt()
	r.GET("/argocd/project", handleGetMgmtArgoProjects)
	r.GET("/argocd/project/:projectName", handleGetMgmtArgoProject)
	r.GET("/argocd/application", handleGetMgmtArgoApplications)
	r.GET("/argocd/applicationset", handleGetMgmtArgoApplicationSets)
	r.GET("/argocd/application/:applicationName", handleGetMgmtArgoApplicationDetail)

	// Add POST routes for creating ArgoCD resources
	r.POST("/argocd/project", handleCreateMgmtArgoProject)
	r.POST("/argocd/application", handleCreateMgmtArgoApplication)
	r.POST("/argocd/applicationset", handleCreateMgmtArgoApplicationSet)

	// Add PUT routes for updating ArgoCD resources
	r.PUT("/argocd/project/:projectName", handleUpdateMgmtArgoProject)
	r.PUT("/argocd/application/:applicationName", handleUpdateMgmtArgoApplication)

	// Add DELETE routes for removing ArgoCD resources
	r.DELETE("/argocd/project/:projectName", handleDeleteMgmtArgoProject)
	r.DELETE("/argocd/application/:applicationName", handleDeleteMgmtArgoApplication)
	r.POST("/argocd/application/:applicationName/sync", handleSyncMgmtArgoApplication)
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

const argocdNamespace = "argocd"

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

// handleGetMgmtArgoProjects handles GET requests for ArgoCD Projects in the management cluster
func handleGetMgmtArgoProjects(c *gin.Context) {
	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	projectList, err := dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list ArgoCD Projects in management cluster")
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
		metadata["labels"].(map[string]interface{})["cluster"] = "mgmt-cluster"

		// Remove managedFields
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"items":      projectList.Items,
		"totalItems": len(projectList.Items),
	})
}

// handleGetMgmtArgoApplications handles GET requests for ArgoCD Applications in the management cluster
func handleGetMgmtArgoApplications(c *gin.Context) {
	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	applicationList, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list ArgoCD Applications in management cluster")
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
		metadata["labels"].(map[string]interface{})["cluster"] = "mgmt-cluster"

		// Remove managedFields
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"items":      applicationList.Items,
		"totalItems": len(applicationList.Items),
	})
}

// handleGetMgmtArgoApplicationSets handles GET requests for ArgoCD ApplicationSets in the management cluster
func handleGetMgmtArgoApplicationSets(c *gin.Context) {
	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	applicationSetList, err := dynamicClient.Resource(applicationSetGVR).Namespace(argocdNamespace).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list ArgoCD ApplicationSets in management cluster")
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
		metadata["labels"].(map[string]interface{})["cluster"] = "mgmt-cluster"

		// Remove managedFields
		delete(metadata, "managedFields")
	}

	common.Success(c, gin.H{
		"items":      applicationSetList.Items,
		"totalItems": len(applicationSetList.Items),
	})
}

// handleGetMgmtArgoProject handles GET requests to get detailed information about a specific ArgoCD Project
// including its applications in the management cluster
func handleGetMgmtArgoProject(c *gin.Context) {
	// Get project name from path parameter
	projectName := c.Param("projectName")
	if projectName == "" {
		common.Fail(c, fmt.Errorf("project name cannot be empty"))
		return
	}

	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Get the project
	project, err := dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).Get(c, projectName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ArgoCD Project", "project", projectName)
		common.Fail(c, err)
		return
	}

	// Clean up metadata
	metadata := project.Object["metadata"].(map[string]interface{})

	// Initialize labels if not present
	if metadata["labels"] == nil {
		metadata["labels"] = make(map[string]interface{})
	}

	// Add cluster information
	metadata["labels"].(map[string]interface{})["cluster"] = "mgmt-cluster"

	// Remove managedFields
	delete(metadata, "managedFields")

	// Get applications that belong to this project
	applicationList, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).List(c, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list ArgoCD Applications", "project", projectName)
		common.Fail(c, err)
		return
	}

	// Filter applications by project
	projectApplications := []unstructured.Unstructured{}
	for _, app := range applicationList.Items {
		spec, ok := app.Object["spec"].(map[string]interface{})
		if !ok {
			continue
		}

		appProject, ok := spec["project"].(string)
		if !ok {
			continue
		}

		if appProject == projectName {
			// Clean up metadata
			appMetadata := app.Object["metadata"].(map[string]interface{})

			// Initialize labels if not present
			if appMetadata["labels"] == nil {
				appMetadata["labels"] = make(map[string]interface{})
			}

			// Add cluster information
			appMetadata["labels"].(map[string]interface{})["cluster"] = "mgmt-cluster"

			// Remove managedFields
			delete(appMetadata, "managedFields")

			projectApplications = append(projectApplications, app)
		}
	}

	// Return the project details with its applications
	common.Success(c, gin.H{
		"project":           project,
		"applications":      projectApplications,
		"totalApplications": len(projectApplications),
	})
}

// handleGetMgmtArgoApplicationDetail handles GET requests to get detailed information about a specific ArgoCD Application
// including its resource tree in the management cluster
func handleGetMgmtArgoApplicationDetail(c *gin.Context) {
	// Get application name from path parameter
	applicationName := c.Param("applicationName")
	if applicationName == "" {
		common.Fail(c, fmt.Errorf("application name cannot be empty"))
		return
	}

	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Get the application
	application, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Get(c, applicationName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ArgoCD Application", "application", applicationName)
		common.Fail(c, err)
		return
	}

	// Clean up metadata
	metadata := application.Object["metadata"].(map[string]interface{})

	// Initialize labels if not present
	if metadata["labels"] == nil {
		metadata["labels"] = make(map[string]interface{})
	}

	// Add cluster information
	metadata["labels"].(map[string]interface{})["cluster"] = "mgmt-cluster"

	// Remove managedFields
	delete(metadata, "managedFields")

	// Get application resources
	resources, err := getApplicationResources(c, dynamicClient, application)
	if err != nil {
		klog.ErrorS(err, "Failed to get application resources", "application", applicationName)
		common.Fail(c, err)
		return
	}

	// Build resource tree
	resourceTree := buildResourceTree(resources)

	// Return the application details with its resource tree
	common.Success(c, gin.H{
		"application":    application,
		"resourceTree":   resourceTree,
		"totalResources": len(resources),
	})
}

// handleCreateMgmtArgoProject handles POST requests to create ArgoCD Projects in the management cluster
func handleCreateMgmtArgoProject(c *gin.Context) {
	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Parse request body
	var projectObj map[string]interface{}
	if err := c.BindJSON(&projectObj); err != nil {
		klog.ErrorS(err, "Failed to bind JSON for ArgoCD Project")
		common.Fail(c, err)
		return
	}

	// Create unstructured object
	project := &unstructured.Unstructured{
		Object: projectObj,
	}

	// Ensure namespace is set
	metadata, ok := project.Object["metadata"].(map[string]interface{})
	if !ok {
		metadata = make(map[string]interface{})
		project.Object["metadata"] = metadata
	}
	metadata["namespace"] = argocdNamespace

	// Create the project
	createdProject, err := dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).Create(c, project, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create ArgoCD Project")
		common.Fail(c, err)
		return
	}

	// Return the created project
	common.Success(c, createdProject)
}

// handleCreateMgmtArgoApplication handles POST requests to create ArgoCD Applications in the management cluster
func handleCreateMgmtArgoApplication(c *gin.Context) {
	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Parse request body
	var applicationObj map[string]interface{}
	if err := c.BindJSON(&applicationObj); err != nil {
		klog.ErrorS(err, "Failed to bind JSON for ArgoCD Application")
		common.Fail(c, err)
		return
	}

	// Create unstructured object
	application := &unstructured.Unstructured{
		Object: applicationObj,
	}

	// Ensure namespace is set
	metadata, ok := application.Object["metadata"].(map[string]interface{})
	if !ok {
		metadata = make(map[string]interface{})
		application.Object["metadata"] = metadata
	}
	metadata["namespace"] = argocdNamespace

	// Create the application
	createdApplication, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Create(c, application, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create ArgoCD Application")
		common.Fail(c, err)
		return
	}

	// Return the created application
	common.Success(c, createdApplication)
}

// handleCreateMgmtArgoApplicationSet handles POST requests to create ArgoCD ApplicationSets in the management cluster
func handleCreateMgmtArgoApplicationSet(c *gin.Context) {
	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Parse request body
	var applicationSetObj map[string]interface{}
	if err := c.BindJSON(&applicationSetObj); err != nil {
		klog.ErrorS(err, "Failed to bind JSON for ArgoCD ApplicationSet")
		common.Fail(c, err)
		return
	}

	// Create unstructured object
	applicationSet := &unstructured.Unstructured{
		Object: applicationSetObj,
	}

	// Ensure namespace is set
	metadata, ok := applicationSet.Object["metadata"].(map[string]interface{})
	if !ok {
		metadata = make(map[string]interface{})
		applicationSet.Object["metadata"] = metadata
	}
	metadata["namespace"] = argocdNamespace

	// Create the applicationSet
	createdApplicationSet, err := dynamicClient.Resource(applicationSetGVR).Namespace(argocdNamespace).Create(c, applicationSet, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create ArgoCD ApplicationSet")
		common.Fail(c, err)
		return
	}

	// Return the created applicationSet
	common.Success(c, createdApplicationSet)
}

// handleUpdateMgmtArgoProject handles PUT requests to update ArgoCD Projects in the management cluster
func handleUpdateMgmtArgoProject(c *gin.Context) {
	// Get project name from path parameter
	projectName := c.Param("projectName")
	if projectName == "" {
		common.Fail(c, fmt.Errorf("project name cannot be empty"))
		return
	}

	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Parse request body
	var projectObj map[string]interface{}
	if err := c.BindJSON(&projectObj); err != nil {
		klog.ErrorS(err, "Failed to bind JSON for ArgoCD Project")
		common.Fail(c, err)
		return
	}

	// Create unstructured object
	project := &unstructured.Unstructured{
		Object: projectObj,
	}

	// Ensure namespace is set
	metadata, ok := project.Object["metadata"].(map[string]interface{})
	if !ok {
		metadata = make(map[string]interface{})
		project.Object["metadata"] = metadata
	}
	metadata["namespace"] = argocdNamespace
	// Ensure name matches the path parameter
	metadata["name"] = projectName

	// Update the project
	updatedProject, err := dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).Update(c, project, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update ArgoCD Project", "project", projectName)
		common.Fail(c, err)
		return
	}

	// Return the updated project
	common.Success(c, updatedProject)
}

// handleUpdateMgmtArgoApplication handles PUT requests to update ArgoCD Applications in the management cluster
func handleUpdateMgmtArgoApplication(c *gin.Context) {
	// Get application name from path parameter
	applicationName := c.Param("applicationName")
	if applicationName == "" {
		common.Fail(c, fmt.Errorf("application name cannot be empty"))
		return
	}

	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Parse request body
	var applicationObj map[string]interface{}
	if err := c.BindJSON(&applicationObj); err != nil {
		klog.ErrorS(err, "Failed to bind JSON for ArgoCD Application")
		common.Fail(c, err)
		return
	}

	// Create unstructured object
	application := &unstructured.Unstructured{
		Object: applicationObj,
	}

	// Ensure namespace is set
	metadata, ok := application.Object["metadata"].(map[string]interface{})
	if !ok {
		metadata = make(map[string]interface{})
		application.Object["metadata"] = metadata
	}
	metadata["namespace"] = argocdNamespace
	// Ensure name matches the path parameter
	metadata["name"] = applicationName

	// Update the application
	updatedApplication, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Update(c, application, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update ArgoCD Application", "application", applicationName)
		common.Fail(c, err)
		return
	}

	// Return the updated application
	common.Success(c, updatedApplication)
}

// handleDeleteMgmtArgoProject handles DELETE requests to delete ArgoCD Projects in the management cluster
func handleDeleteMgmtArgoProject(c *gin.Context) {
	// Get project name from path parameter
	projectName := c.Param("projectName")
	if projectName == "" {
		common.Fail(c, fmt.Errorf("project name cannot be empty"))
		return
	}

	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Delete the project
	err = dynamicClient.Resource(projectGVR).Namespace(argocdNamespace).Delete(c, projectName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete ArgoCD Project", "project", projectName)
		common.Fail(c, err)
		return
	}

	// Return success
	common.Success(c, gin.H{
		"message": fmt.Sprintf("Project %s deleted successfully", projectName),
	})
}

// handleDeleteMgmtArgoApplication handles DELETE requests to delete ArgoCD Applications in the management cluster
func handleDeleteMgmtArgoApplication(c *gin.Context) {
	// Get application name from path parameter
	applicationName := c.Param("applicationName")
	if applicationName == "" {
		common.Fail(c, fmt.Errorf("application name cannot be empty"))
		return
	}

	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Delete the application
	err = dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Delete(c, applicationName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete ArgoCD Application", "application", applicationName)
		common.Fail(c, err)
		return
	}

	// Return success
	common.Success(c, gin.H{
		"message": fmt.Sprintf("Application %s deleted successfully", applicationName),
	})
}

// handleSyncMgmtArgoApplication handles POST requests to sync ArgoCD Applications in the management cluster
func handleSyncMgmtArgoApplication(c *gin.Context) {
	// Get application name from path parameter
	applicationName := c.Param("applicationName")
	if applicationName == "" {
		common.Fail(c, fmt.Errorf("application name cannot be empty"))
		return
	}

	// Create dynamic client for the management cluster
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for management cluster")
		common.Fail(c, err)
		return
	}

	// Get the application
	application, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Get(c, applicationName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ArgoCD Application", "application", applicationName)
		common.Fail(c, err)
		return
	}

	// Add sync annotation
	metadata := application.Object["metadata"].(map[string]interface{})

	// Initialize annotations if not present
	if metadata["annotations"] == nil {
		metadata["annotations"] = make(map[string]interface{})
	}

	// Add sync annotation with current timestamp
	metadata["annotations"].(map[string]interface{})["argocd.argoproj.io/refresh"] = time.Now().Format(time.RFC3339)

	// Update the application
	updatedApplication, err := dynamicClient.Resource(applicationGVR).Namespace(argocdNamespace).Update(c, application, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to sync ArgoCD Application", "application", applicationName)
		common.Fail(c, err)
		return
	}

	// Return the updated application
	common.Success(c, gin.H{
		"message":     fmt.Sprintf("Application %s sync initiated", applicationName),
		"application": updatedApplication,
	})
}

// getApplicationResources retrieves the resources associated with an ArgoCD Application
func getApplicationResources(c *gin.Context, dynamicClient dynamic.Interface, application *unstructured.Unstructured) ([]map[string]interface{}, error) {
	// Get application status
	status, ok := application.Object["status"].(map[string]interface{})
	if !ok || status == nil {
		return []map[string]interface{}{}, nil
	}

	// Get resources from status
	resources, ok := status["resources"].([]interface{})
	if !ok || resources == nil {
		return []map[string]interface{}{}, nil
	}

	// Convert resources to map
	resourceList := []map[string]interface{}{}
	for _, res := range resources {
		resource, ok := res.(map[string]interface{})
		if !ok {
			continue
		}

		// Only include resources of specific kinds
		kind, ok := resource["kind"].(string)
		if !ok {
			continue
		}

		// Check if this kind should be included
		include := false
		for _, includeKind := range resourceKinds {
			if kind == includeKind {
				include = true
				break
			}
		}

		if !include {
			continue
		}

		// Add resource to list
		resourceList = append(resourceList, resource)
	}

	return resourceList, nil
}

// buildResourceTree builds a tree of resources from a flat list
func buildResourceTree(resources []map[string]interface{}) map[string]interface{} {
	tree := map[string]interface{}{
		"nodes": resources,
		"edges": []map[string]interface{}{},
	}

	// Build edges between resources
	edges := []map[string]interface{}{}

	// Map to track resources by UID
	resourceByUID := map[string]map[string]interface{}{}
	for _, resource := range resources {
		uid, ok := resource["uid"].(string)
		if ok && uid != "" {
			resourceByUID[uid] = resource
		}
	}

	// Find parent-child relationships
	for _, resource := range resources {
		// Check for owner references
		ownerRefs, ok := resource["ownerReferences"].([]interface{})
		if !ok || ownerRefs == nil {
			continue
		}

		for _, ownerRef := range ownerRefs {
			ownerReference, ok := ownerRef.(map[string]interface{})
			if !ok {
				continue
			}

			ownerUID, ok := ownerReference["uid"].(string)
			if !ok || ownerUID == "" {
				continue
			}

			// If owner is in the resource list, add an edge
			if _, found := resourceByUID[ownerUID]; found {
				childUID, ok := resource["uid"].(string)
				if !ok || childUID == "" {
					continue
				}

				edges = append(edges, map[string]interface{}{
					"from": ownerUID,
					"to":   childUID,
				})
			}
		}
	}

	tree["edges"] = edges
	return tree
}
