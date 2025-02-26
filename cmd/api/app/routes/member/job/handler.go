package job

import (
	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/job"
)

func handleGetMemberJobs(c *gin.Context) {
	clusterName := c.Param("clustername")
	namespace := common.ParseNamespacePathParameter(c)
	dataSelect := common.ParseDataSelectPathParameter(c)

	memberClient := client.InClusterClientForMemberCluster(clusterName)
	result, err := job.GetJobList(memberClient, namespace, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func handleGetMemberJobDetail(c *gin.Context) {
	clusterName := c.Param("clustername")
	namespace := c.Param("namespace")
	name := c.Param("job")

	memberClient := client.InClusterClientForMemberCluster(clusterName)
	result, err := job.GetJobDetail(memberClient, namespace, name)
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func init() {
	r := router.MemberV1()
	r.GET("/job", handleGetMemberJobs)
	r.GET("/job/:namespace", handleGetMemberJobs)
	r.GET("/job/:namespace/:job", handleGetMemberJobDetail)
}
