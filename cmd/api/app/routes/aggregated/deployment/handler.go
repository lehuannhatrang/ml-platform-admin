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

package deployment

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/deployment"
)

func handleGetAggregatedDeployments(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	
	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)
	
	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedDeployments deployment.DeploymentList

	// Fetch deployments from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := deployment.GetDeploymentList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster information to each deployment's metadata
		for _, d := range result.Deployments {
			if d.ObjectMeta.Labels == nil {
				d.ObjectMeta.Labels = make(map[string]string)
			}
			d.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedDeployments.Deployments = append(aggregatedDeployments.Deployments, d)
		}
	}

	aggregatedDeployments.ListMeta.TotalItems = len(aggregatedDeployments.Deployments)
	if len(aggregatedDeployments.Deployments) == 0 {
		aggregatedDeployments.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedDeployments)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/deployment", handleGetAggregatedDeployments)
	r.GET("/aggregated/deployment/:namespace", handleGetAggregatedDeployments)
}
