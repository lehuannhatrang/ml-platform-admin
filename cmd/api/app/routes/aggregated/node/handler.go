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

package node

import (
	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/node"
	utilauth "github.com/karmada-io/dashboard/pkg/util/utilauth"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"
)

func handleGetAggregatedNodes(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	username := utilauth.GetAuthenticatedUser(c)
	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect, username)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedNodes node.NodeList

	// Fetch nodes from each cluster
	for _, cluster := range clusters.Clusters {
		klog.InfoS("Fetching nodes from cluster", "cluster", cluster)
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue

		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := node.GetNodeList(memberClient, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster information to each node's metadata
		for _, n := range result.Items {
			n.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedNodes.Items = append(aggregatedNodes.Items, n)
		}
	}

	aggregatedNodes.ListMeta.TotalItems = len(aggregatedNodes.Items)
	if len(aggregatedNodes.Items) == 0 {
		aggregatedNodes.ListMeta.TotalItems = 0
	}

	// Create response with aggregated nodes
	response := aggregatedNodes

	common.Success(c, response)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/node", handleGetAggregatedNodes)
}
