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

package pod

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/pod"
)

func handleGetAggregatedPods(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	
	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)
	
	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedPods pod.PodList

	// Fetch pods from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := pod.GetPodList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster information to each pod's metadata
		for _, p := range result.Items {
			if p.ObjectMeta.Labels == nil {
				p.ObjectMeta.Labels = make(map[string]string)
			}
			p.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedPods.Items = append(aggregatedPods.Items, p)
		}
	}

	aggregatedPods.ListMeta.TotalItems = len(aggregatedPods.Items)
	if len(aggregatedPods.Items) == 0 {
		aggregatedPods.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedPods)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/pod", handleGetAggregatedPods)
	r.GET("/aggregated/pod/:namespace", handleGetAggregatedPods)
}
