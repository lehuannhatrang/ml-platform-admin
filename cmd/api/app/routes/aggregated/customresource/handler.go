package customresource

import (
	"fmt"
	"sort"
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
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
)

func init() {
	r := router.V1()
	r.GET("/aggregated/customresource", handleGetAggregatedCustomResources)
	r.GET("/aggregated/customresource/definition", handleGetAggregatedCustomResourceDefinitions)
	r.GET("/aggregated/customresource/apiVersion", handleGetAggregatedAPIVersions)
}

// handleGetAggregatedAPIVersions handles GET requests for API versions across all member clusters
func handleGetAggregatedAPIVersions(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	dataSelect := common.ParseDataSelectPathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Store API versions by cluster
	type APIVersionInfo struct {
		Group    string   `json:"group"`
		Versions []string `json:"versions"`
		Cluster  string   `json:"cluster"`
	}

	var result []APIVersionInfo

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

		crdGVR := schema.GroupVersionResource{
			Group:    "apiextensions.k8s.io",
			Version:  "v1",
			Resource: "customresourcedefinitions",
		}

		crdList, err := dynamicClient.Resource(crdGVR).List(c, metav1.ListOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to list CRDs", "cluster", cluster.ObjectMeta.Name)
			continue
		}

		// Track unique groups for this cluster
		clusterGroups := make(map[string]bool)

		// Extract API versions from CRDs
		for _, crd := range crdList.Items {
			group := crd.Object["spec"].(map[string]interface{})["group"].(string)
			versions := crd.Object["spec"].(map[string]interface{})["versions"].([]interface{})

			// Skip if we already processed this group for this cluster
			if clusterGroups[group] {
				continue
			}
			clusterGroups[group] = true

			// Create new APIVersionInfo
			info := APIVersionInfo{
				Group:    group,
				Versions: make([]string, 0),
				Cluster:  cluster.ObjectMeta.Name,
			}

			// Add versions
			for _, v := range versions {
				version := v.(map[string]interface{})["name"].(string)
				versionFound := false
				for _, existingVersion := range info.Versions {
					if existingVersion == version {
						versionFound = true
						break
					}
				}
				if !versionFound {
					info.Versions = append(info.Versions, version)
				}
			}

			sort.Strings(info.Versions)
			result = append(result, info)
		}
	}

	// Sort results by group name
	sort.Slice(result, func(i, j int) bool {
		return result[i].Group < result[j].Group
	})

	response := gin.H{
		"items":      result,
		"totalItems": len(result),
	}

	common.Success(c, response)
}

// handleGetAggregatedCustomResources handles GET requests for custom resources across all member clusters
func handleGetAggregatedCustomResources(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	dataSelect := common.ParseDataSelectPathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	// For each cluster, get its CRDs and resources
	var allResources []unstructured.Unstructured

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

		// Get CRDs for this cluster
		crdGVR := schema.GroupVersionResource{
			Group:    "apiextensions.k8s.io",
			Version:  "v1",
			Resource: "customresourcedefinitions",
		}

		crdList, err := dynamicClient.Resource(crdGVR).List(c, metav1.ListOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to list CRDs", "cluster", cluster.ObjectMeta.Name)
			continue // Skip this cluster if we can't get CRDs
		}

		// For each CRD, get its resources
		for _, crd := range crdList.Items {
			group := crd.Object["spec"].(map[string]interface{})["group"].(string)
			version := crd.Object["spec"].(map[string]interface{})["versions"].([]interface{})[0].(map[string]interface{})["name"].(string)
			plural := crd.Object["spec"].(map[string]interface{})["names"].(map[string]interface{})["plural"].(string)

			gvr := schema.GroupVersionResource{
				Group:    group,
				Version:  version,
				Resource: plural,
			}

			resources, err := dynamicClient.Resource(gvr).List(c, metav1.ListOptions{})
			if err != nil {
				klog.V(4).InfoS("Failed to list resources", "gvr", gvr, "cluster", cluster.ObjectMeta.Name)
				continue // Skip if we can't access this resource type
			}

			// Add cluster information to each resource's metadata
			for _, resource := range resources.Items {
				if resource.Object["metadata"].(map[string]interface{})["labels"] == nil {
					resource.Object["metadata"].(map[string]interface{})["labels"] = make(map[string]interface{})
				}
				resource.Object["metadata"].(map[string]interface{})["labels"].(map[string]interface{})["cluster"] = cluster.ObjectMeta.Name
				allResources = append(allResources, resource)
			}
		}
	}

	response := gin.H{
		"items":      allResources,
		"totalItems": len(allResources),
	}

	common.Success(c, response)
}

// handleGetAggregatedCustomResourceDefinitions handles GET requests for CRDs across all member clusters
func handleGetAggregatedCustomResourceDefinitions(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	dataSelect := common.ParseDataSelectPathParameter(c)

	// Check if grouping by group is requested
	groupBy := c.Query("groupBy")

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	// For each cluster, get its CRDs
	var allCRDs []unstructured.Unstructured
	groupedCRDs := make(map[string][]unstructured.Unstructured)

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

		crdGVR := schema.GroupVersionResource{
			Group:    "apiextensions.k8s.io",
			Version:  "v1",
			Resource: "customresourcedefinitions",
		}

		crdList, err := dynamicClient.Resource(crdGVR).List(c, metav1.ListOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to list CRDs", "cluster", cluster.ObjectMeta.Name)
			continue // Skip this cluster if we can't get CRDs
		}

		// Add cluster information to each CRD's metadata and extract necessary info from spec
		for _, crd := range crdList.Items {
			// Clean up metadata
			metadata := crd.Object["metadata"].(map[string]interface{})
			
			// Initialize labels if not present
			if metadata["labels"] == nil {
				metadata["labels"] = make(map[string]interface{})
			}
			
			// Add cluster information
			metadata["labels"].(map[string]interface{})["cluster"] = cluster.ObjectMeta.Name

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
				// Create unique group key combining group name and cluster
				groupKey := fmt.Sprintf("%s-%s", group, cluster.ObjectMeta.Name)
				groupedCRDs[groupKey] = append(groupedCRDs[groupKey], crd)
			} else {
				allCRDs = append(allCRDs, crd)
			}
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

		for _, groupKey := range groups {
			crds := groupedCRDs[groupKey]
			// Extract group and cluster from the groupKey
			parts := strings.Split(groupKey, "-")
			group, cluster := parts[0], parts[1]

			totalItems += len(crds)
			groupedResponse = append(groupedResponse, gin.H{
				"group":   group,
				"cluster": cluster,
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
