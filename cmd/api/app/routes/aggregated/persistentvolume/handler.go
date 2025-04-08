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

package persistentvolume

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/persistentvolume"
)

func handleGetAggregatedPersistentVolumes(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	
	dataSelect := common.ParseDataSelectPathParameter(c)
	
	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedPersistentVolumes persistentvolume.PersistentVolumeList

	// Fetch persistentvolumes from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := persistentvolume.GetPersistentVolumeList(memberClient, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster information to each PV's metadata
		for _, pv := range result.PersistentVolumes {
			if pv.ObjectMeta.Labels == nil {
				pv.ObjectMeta.Labels = make(map[string]string)
			}
			pv.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedPersistentVolumes.PersistentVolumes = append(aggregatedPersistentVolumes.PersistentVolumes, pv)
		}
	}

	aggregatedPersistentVolumes.ListMeta.TotalItems = len(aggregatedPersistentVolumes.PersistentVolumes)
	if len(aggregatedPersistentVolumes.PersistentVolumes) == 0 {
		aggregatedPersistentVolumes.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedPersistentVolumes)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/persistentvolume", handleGetAggregatedPersistentVolumes)
	r.GET("/aggregated/persistentvolume/:namespace", handleGetAggregatedPersistentVolumes)
}
