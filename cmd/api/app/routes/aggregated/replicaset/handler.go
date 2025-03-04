package replicaset

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/replicaset"
)

func handleGetAggregatedReplicaSets(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedReplicaSets replicaset.ReplicaSetList

	// Fetch replicasets from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := replicaset.GetReplicaSetList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster name to each replicaset
		for _, rs := range result.Items {
			if rs.ObjectMeta.Labels == nil {
				rs.ObjectMeta.Labels = make(map[string]string)
			}
			rs.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedReplicaSets.Items = append(aggregatedReplicaSets.Items, rs)
		}
	}

	aggregatedReplicaSets.ListMeta.TotalItems = len(aggregatedReplicaSets.Items)
	if len(aggregatedReplicaSets.Items) == 0 {
		aggregatedReplicaSets.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedReplicaSets)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/replicaset", handleGetAggregatedReplicaSets)
	r.GET("/aggregated/replicaset/:namespace", handleGetAggregatedReplicaSets)
}
