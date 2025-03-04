package secret

import (
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	"github.com/karmada-io/dashboard/pkg/resource/secret"
)

func handleGetAggregatedSecrets(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	dataSelect := common.ParseDataSelectPathParameter(c)
	namespace := common.ParseNamespacePathParameter(c)

	// Get all clusters
	clusters, err := cluster.GetClusterList(karmadaClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	var aggregatedSecrets secret.SecretList

	// Fetch secrets from each cluster
	for _, cluster := range clusters.Clusters {
		// Skip clusters that are not ready
		isReady := cluster.Ready == metav1.ConditionTrue
		if !isReady {
			continue
		}

		memberClient := client.InClusterClientForMemberCluster(cluster.ObjectMeta.Name)
		result, err := secret.GetSecretList(memberClient, namespace, dataSelect)
		if err != nil {
			// Log error but continue with other clusters
			continue
		}

		// Add cluster name to each secret
		for _, s := range result.Secrets {
			if s.ObjectMeta.Labels == nil {
				s.ObjectMeta.Labels = make(map[string]string)
			}
			s.ObjectMeta.Labels["cluster"] = cluster.ObjectMeta.Name
			aggregatedSecrets.Secrets = append(aggregatedSecrets.Secrets, s)
		}
	}

	aggregatedSecrets.ListMeta.TotalItems = len(aggregatedSecrets.Secrets)
	if len(aggregatedSecrets.Secrets) == 0 {
		aggregatedSecrets.ListMeta.TotalItems = 0
	}

	common.Success(c, aggregatedSecrets)
}

func init() {
	r := router.V1()
	r.GET("/aggregated/secret", handleGetAggregatedSecrets)
	r.GET("/aggregated/secret/:namespace", handleGetAggregatedSecrets)
}
