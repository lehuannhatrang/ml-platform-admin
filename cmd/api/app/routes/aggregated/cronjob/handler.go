package cronjob

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/cronjob"
)

func handleGetAggregatedCronJobs(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedCronJobs cronjob.CronJobList

	// Fetch cronjobs from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := cronjob.GetCronJobList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster name to each cronjob
		for _, j := range result.Items {
			if j.ObjectMeta.Labels == nil {
				j.ObjectMeta.Labels = make(map[string]string)
			}
			j.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedCronJobs.Items = append(aggregatedCronJobs.Items, j)
		}
	}

	aggregatedCronJobs.ListMeta.TotalItems = len(aggregatedCronJobs.Items)
	if len(aggregatedCronJobs.Items) == 0 {
		aggregatedCronJobs.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedCronJobs)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/cronjob", handleGetAggregatedCronJobs)
	r.GET("/aggregated/cronjob/:namespace", handleGetAggregatedCronJobs)
}
