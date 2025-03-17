package argocd

import (
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
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
)

func init() {
	r := router.V1()
	r.GET("/aggregated/argocd/project", handleGetAggregatedArgoProjects)
	r.GET("/aggregated/argocd/application", handleGetAggregatedArgoApplications)
	r.GET("/aggregated/argocd/applicationset", handleGetAggregatedArgoApplicationSets)
}

// handleGetAggregatedArgoProjects handles GET requests for ArgoCD Projects across all member clusters
func handleGetAggregatedArgoProjects(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	dataSelect := common.ParseDataSelectPathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	// For each cluster, get its ArgoCD Projects
	var allProjects []unstructured.Unstructured

	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		// Get member cluster config
		memberConfig, err := client.GetMemberConfig()
		if err != nil {
			klog.ErrorS(err, "Failed to get member config")
			continue
		}

		karmadaConfig, _, err := client.GetKarmadaConfig()
		if err != nil {
			klog.ErrorS(err, "Failed to get karmada config")
			continue
		}

		// Set up member cluster proxy URL
		memberConfig.Host = karmadaConfig.Host + fmt.Sprintf("/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy/", cluster.ObjectMeta.Name)
		klog.V(4).InfoS("Using member config", "host", memberConfig.Host)

		// Create dynamic client
		dynamicClient, err := dynamic.NewForConfig(memberConfig)
		if err != nil {
			klog.ErrorS(err, "Failed to create dynamic client")
			continue
		}

		projectGVR := schema.GroupVersionResource{
			Group:    "argoproj.io",
			Version:  "v1alpha1",
			Resource: "appprojects",
		}

		projectList, err := dynamicClient.Resource(projectGVR).List(c, metav1.ListOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to list ArgoCD Projects", "cluster", cluster.ObjectMeta.Name)
			continue // Skip this cluster if we can't get projects
		}

		// Add cluster information to each project
		for _, project := range projectList.Items {
			// Clean up metadata
			metadata := project.Object["metadata"].(map[string]interface{})
			
			// Initialize labels if not present
			if metadata["labels"] == nil {
				metadata["labels"] = make(map[string]interface{})
			}
			
			// Add cluster information
			metadata["labels"].(map[string]interface{})["cluster"] = cluster.ObjectMeta.Name

			// Remove managedFields
			delete(metadata, "managedFields")

			// Add to our result list
			allProjects = append(allProjects, project)
		}
	}

	// Sort by name for consistent ordering
	sort.Slice(allProjects, func(i, j int) bool {
		iName := allProjects[i].Object["metadata"].(map[string]interface{})["name"].(string)
		jName := allProjects[j].Object["metadata"].(map[string]interface{})["name"].(string)
		return iName < jName
	})

	common.Success(c, gin.H{
		"items":      allProjects,
		"totalItems": len(allProjects),
	})
}

// handleGetAggregatedArgoApplications handles GET requests for ArgoCD Applications across all member clusters
func handleGetAggregatedArgoApplications(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	dataSelect := common.ParseDataSelectPathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	// For each cluster, get its ArgoCD Applications
	var allApplications []unstructured.Unstructured

	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		// Get member cluster config
		memberConfig, err := client.GetMemberConfig()
		if err != nil {
			klog.ErrorS(err, "Failed to get member config")
			continue
		}

		karmadaConfig, _, err := client.GetKarmadaConfig()
		if err != nil {
			klog.ErrorS(err, "Failed to get karmada config")
			continue
		}

		// Set up member cluster proxy URL
		memberConfig.Host = karmadaConfig.Host + fmt.Sprintf("/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy/", cluster.ObjectMeta.Name)
		klog.V(4).InfoS("Using member config", "host", memberConfig.Host)

		// Create dynamic client
		dynamicClient, err := dynamic.NewForConfig(memberConfig)
		if err != nil {
			klog.ErrorS(err, "Failed to create dynamic client")
			continue
		}

		applicationGVR := schema.GroupVersionResource{
			Group:    "argoproj.io",
			Version:  "v1alpha1",
			Resource: "applications",
		}

		applicationList, err := dynamicClient.Resource(applicationGVR).List(c, metav1.ListOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to list ArgoCD Applications", "cluster", cluster.ObjectMeta.Name)
			continue // Skip this cluster if we can't get applications
		}

		// Add cluster information to each application
		for _, application := range applicationList.Items {
			// Clean up metadata
			metadata := application.Object["metadata"].(map[string]interface{})
			
			// Initialize labels if not present
			if metadata["labels"] == nil {
				metadata["labels"] = make(map[string]interface{})
			}
			
			// Add cluster information
			metadata["labels"].(map[string]interface{})["cluster"] = cluster.ObjectMeta.Name

			// Remove managedFields
			delete(metadata, "managedFields")

			// Add to our result list
			allApplications = append(allApplications, application)
		}
	}

	// Sort by name for consistent ordering
	sort.Slice(allApplications, func(i, j int) bool {
		iName := allApplications[i].Object["metadata"].(map[string]interface{})["name"].(string)
		jName := allApplications[j].Object["metadata"].(map[string]interface{})["name"].(string)
		return iName < jName
	})

	common.Success(c, gin.H{
		"items":      allApplications,
		"totalItems": len(allApplications),
	})
}

// handleGetAggregatedArgoApplicationSets handles GET requests for ArgoCD ApplicationSets across all member clusters
func handleGetAggregatedArgoApplicationSets(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	dataSelect := common.ParseDataSelectPathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	// For each cluster, get its ArgoCD ApplicationSets
	var allApplicationSets []unstructured.Unstructured

	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		// Get member cluster config
		memberConfig, err := client.GetMemberConfig()
		if err != nil {
			klog.ErrorS(err, "Failed to get member config")
			continue
		}

		karmadaConfig, _, err := client.GetKarmadaConfig()
		if err != nil {
			klog.ErrorS(err, "Failed to get karmada config")
			continue
		}

		// Set up member cluster proxy URL
		memberConfig.Host = karmadaConfig.Host + fmt.Sprintf("/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy/", cluster.ObjectMeta.Name)
		klog.V(4).InfoS("Using member config", "host", memberConfig.Host)

		// Create dynamic client
		dynamicClient, err := dynamic.NewForConfig(memberConfig)
		if err != nil {
			klog.ErrorS(err, "Failed to create dynamic client")
			continue
		}

		applicationSetGVR := schema.GroupVersionResource{
			Group:    "argoproj.io",
			Version:  "v1alpha1",
			Resource: "applicationsets",
		}

		applicationSetList, err := dynamicClient.Resource(applicationSetGVR).List(c, metav1.ListOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to list ArgoCD ApplicationSets", "cluster", cluster.ObjectMeta.Name)
			continue // Skip this cluster if we can't get applicationsets
		}

		// Add cluster info to each ApplicationSet
		for i := range applicationSetList.Items {
			appSet := &applicationSetList.Items[i]
			
			// Add cluster info to the labels
			if appSet.Object["metadata"] == nil {
				appSet.Object["metadata"] = map[string]interface{}{}
			}
			
			metadata := appSet.Object["metadata"].(map[string]interface{})
			if metadata["labels"] == nil {
				metadata["labels"] = map[string]interface{}{}
			}
			
			labels := metadata["labels"].(map[string]interface{})
			labels["cluster"] = cluster.ObjectMeta.Name
			
			allApplicationSets = append(allApplicationSets, *appSet)
		}
	}

	// Sort the ApplicationSets by name
	sort.Slice(allApplicationSets, func(i, j int) bool {
		nameI, _, _ := unstructured.NestedString(allApplicationSets[i].Object, "metadata", "name")
		nameJ, _, _ := unstructured.NestedString(allApplicationSets[j].Object, "metadata", "name")
		return nameI < nameJ
	})

	// Return the ApplicationSets
	c.JSON(200, gin.H{
		"items":      allApplicationSets,
		"totalItems": len(allApplicationSets),
	})
}
