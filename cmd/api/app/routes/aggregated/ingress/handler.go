package ingress

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/ingress"
)

func handleGetAggregatedIngresses(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedIngresses ingress.IngressList

	// Fetch ingresses from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := ingress.GetIngressList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster name to each ingress
		for _, i := range result.Items {
			if i.ObjectMeta.Labels == nil {
				i.ObjectMeta.Labels = make(map[string]string)
			}
			i.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedIngresses.Items = append(aggregatedIngresses.Items, i)
		}
	}

	aggregatedIngresses.ListMeta.TotalItems = len(aggregatedIngresses.Items)
	if len(aggregatedIngresses.Items) == 0 {
		aggregatedIngresses.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedIngresses)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/ingress", handleGetAggregatedIngresses)
	r.GET("/aggregated/ingress/:namespace", handleGetAggregatedIngresses)
}
