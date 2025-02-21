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

package statefulset

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/statefulset"
)

func handleGetAggregatedStatefulSets(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	
	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)
	
	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedStatefulSets statefulset.StatefulSetList

	// Fetch statefulsets from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := statefulset.GetStatefulSetList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster information to each statefulset's metadata
		for _, s := range result.StatefulSets {
			if s.ObjectMeta.Labels == nil {
				s.ObjectMeta.Labels = make(map[string]string)
			}
			s.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedStatefulSets.StatefulSets = append(aggregatedStatefulSets.StatefulSets, s)
		}
	}

	aggregatedStatefulSets.ListMeta.TotalItems = len(aggregatedStatefulSets.StatefulSets)
	if len(aggregatedStatefulSets.StatefulSets) == 0 {
		aggregatedStatefulSets.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedStatefulSets)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/statefulset", handleGetAggregatedStatefulSets)
	r.GET("/aggregated/statefulset/:namespace", handleGetAggregatedStatefulSets)
}
