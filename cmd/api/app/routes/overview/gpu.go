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

package overview

import (
	"context"
	"strconv"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/pkg/client"
)

const (
	// GPUResourceKey is the key for GPU capacity in node status
	GPUResourceKey = "nvidia.com/gpu"
	// GPUProductLabel is the label key for GPU model/product
	GPUProductLabel = "nvidia.com/gpu.product"
)

// GetGPUSummaryFromClusters collects GPU information from all member clusters
func GetGPUSummaryFromClusters(c *gin.Context, clusterNames []string) *v1.GPUSummary {
	ctx := context.TODO()
	
	// Map to track GPU counts by model
	gpuByModel := make(map[string]int64)
	var totalGPUs int64

	for _, clusterName := range clusterNames {
		// Skip empty cluster names
		if clusterName == "" {
			continue
		}

		// Get kubernetes client for the member cluster
		kubeClient := client.InClusterClientForMemberCluster(clusterName)
		if kubeClient == nil {
			klog.V(4).InfoS("Failed to get kubernetes client for cluster", "cluster", clusterName)
			continue
		}

		// List all nodes in the cluster
		nodes, err := kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
		if err != nil {
			klog.V(4).ErrorS(err, "Failed to list nodes in cluster", "cluster", clusterName)
			continue
		}

		// Process each node
		for _, node := range nodes.Items {
			// Get GPU count from status.capacity["nvidia.com/gpu"]
			if gpuQuantity, exists := node.Status.Capacity[GPUResourceKey]; exists {
				gpuCount := gpuQuantity.Value()
				
				if gpuCount > 0 {
					// Get GPU model from labels["nvidia.com/gpu.product"]
					gpuModel := "Unknown"
					if model, labelExists := node.Labels[GPUProductLabel]; labelExists && model != "" {
						gpuModel = model
					}

					// Add to the map
					gpuByModel[gpuModel] += gpuCount
					totalGPUs += gpuCount
					
					klog.V(4).InfoS("Found GPU in node",
						"cluster", clusterName,
						"node", node.Name,
						"model", gpuModel,
						"count", gpuCount)
				}
			}
		}
	}

	// Convert map to GPUPool slice
	gpuPools := make([]v1.GPUPool, 0, len(gpuByModel))
	for model, count := range gpuByModel {
		gpuPools = append(gpuPools, v1.GPUPool{
			Model: model,
			Count: count,
		})
	}

	return &v1.GPUSummary{
		TotalGPU: totalGPUs,
		GPUPools: gpuPools,
	}
}

// GetGPUSummaryFromClusterList collects GPU information from cluster list result
func GetGPUSummaryFromClusterList(c *gin.Context, clusters []string) *v1.GPUSummary {
	return GetGPUSummaryFromClusters(c, clusters)
}

// parseGPUCount safely parses GPU count from various formats
func parseGPUCount(value string) int64 {
	count, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		klog.V(4).InfoS("Failed to parse GPU count, defaulting to 0", "value", value, "error", err)
		return 0
	}
	return count
}

