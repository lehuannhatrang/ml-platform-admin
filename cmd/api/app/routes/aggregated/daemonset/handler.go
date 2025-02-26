package daemonset

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/daemonset"
)

func handleGetAggregatedDaemonsets(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedDaemonsets daemonset.DaemonSetList

	// Fetch daemonsets from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := daemonset.GetDaemonSetList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster name to each daemonset
		for _, d := range result.DaemonSets {
			if d.ObjectMeta.Labels == nil {
				d.ObjectMeta.Labels = make(map[string]string)
			}
			d.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedDaemonsets.DaemonSets = append(aggregatedDaemonsets.DaemonSets, d)
		}
	}

	aggregatedDaemonsets.ListMeta.TotalItems = len(aggregatedDaemonsets.DaemonSets)
	if len(aggregatedDaemonsets.DaemonSets) == 0 {
		aggregatedDaemonsets.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedDaemonsets)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/daemonset", handleGetAggregatedDaemonsets)
	r.GET("/aggregated/daemonset/:namespace", handleGetAggregatedDaemonsets)
}
