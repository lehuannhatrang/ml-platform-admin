package configmap

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/configmap"
)

func handleGetAggregatedConfigMaps(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedConfigMaps configmap.ConfigMapList

	// Fetch configmaps from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := configmap.GetConfigMapList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster name to each configmap
		for _, cm := range result.Items {
			if cm.ObjectMeta.Labels == nil {
				cm.ObjectMeta.Labels = make(map[string]string)
			}
			cm.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedConfigMaps.Items = append(aggregatedConfigMaps.Items, cm)
		}
	}

	aggregatedConfigMaps.ListMeta.TotalItems = len(aggregatedConfigMaps.Items)
	if len(aggregatedConfigMaps.Items) == 0 {
		aggregatedConfigMaps.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedConfigMaps)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/configmap", handleGetAggregatedConfigMaps)
	r.GET("/aggregated/configmap/:namespace", handleGetAggregatedConfigMaps)
}
