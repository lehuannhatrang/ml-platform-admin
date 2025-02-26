package job

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/job"
)

func handleGetAggregatedJobs(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedJobs job.JobList

	// Fetch jobs from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := job.GetJobList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster name to each job
		for _, j := range result.Jobs {
			if j.ObjectMeta.Labels == nil {
				j.ObjectMeta.Labels = make(map[string]string)
			}
			j.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedJobs.Jobs = append(aggregatedJobs.Jobs, j)
		}
	}

	aggregatedJobs.ListMeta.TotalItems = len(aggregatedJobs.Jobs)
	if len(aggregatedJobs.Jobs) == 0 {
		aggregatedJobs.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedJobs)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/job", handleGetAggregatedJobs)
	r.GET("/aggregated/job/:namespace", handleGetAggregatedJobs)
}
