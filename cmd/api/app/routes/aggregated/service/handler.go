package service

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/service"
)

func handleGetAggregatedServices(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedServices service.ServiceList

	// Fetch services from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := service.GetServiceList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster name to each service
		for _, s := range result.Services {
			if s.ObjectMeta.Labels == nil {
				s.ObjectMeta.Labels = make(map[string]string)
			}
			s.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedServices.Services = append(aggregatedServices.Services, s)
		}
	}

	aggregatedServices.ListMeta.TotalItems = len(aggregatedServices.Services)
	if len(aggregatedServices.Services) == 0 {
		aggregatedServices.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedServices)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/service", handleGetAggregatedServices)
	r.GET("/aggregated/service/:namespace", handleGetAggregatedServices)
}
