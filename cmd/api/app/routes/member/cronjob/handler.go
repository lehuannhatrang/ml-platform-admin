package cronjob

import (
	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cronjob"
)

func handleGetMemberCronJobs(c *gin.Context) {
	clusterName := c.Param("clustername")
	namespace := common.ParseNamespacePathParameter(c)
	dataSelect := common.ParseDataSelectPathParameter(c)

	memberClient := client.InClusterClientForMemberCluster(clusterName)
	result, err := cronjob.GetCronJobList(memberClient, namespace, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func handleGetMemberCronJobDetail(c *gin.Context) {
	clusterName := c.Param("clustername")
	namespace := c.Param("namespace")
	name := c.Param("cronjob")

	memberClient := client.InClusterClientForMemberCluster(clusterName)
	result, err := cronjob.GetCronJobDetail(memberClient, namespace, name)
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func init() {
	r := router.MemberV1()
	r.GET("/cronjob", handleGetMemberCronJobs)
	r.GET("/cronjob/:namespace", handleGetMemberCronJobs)
	r.GET("/cronjob/:namespace/:cronjob", handleGetMemberCronJobDetail)
}
