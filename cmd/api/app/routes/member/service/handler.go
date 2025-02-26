package service

import (
	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/service"
)

func handleGetMemberServices(c *gin.Context) {
	clusterName := c.Param("clustername")
	namespace := common.ParseNamespacePathParameter(c)
	dataSelect := common.ParseDataSelectPathParameter(c)

	memberClient := client.InClusterClientForMemberCluster(clusterName)
	result, err := service.GetServiceList(memberClient, namespace, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func handleGetMemberServiceDetail(c *gin.Context) {
	clusterName := c.Param("clustername")
	namespace := c.Param("namespace")
	name := c.Param("name")

	memberClient := client.InClusterClientForMemberCluster(clusterName)
	result, err := service.GetServiceDetail(memberClient, namespace, name)
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func init() {
	r := router.MemberV1()
	r.GET("/service", handleGetMemberServices)
	r.GET("/service/:namespace", handleGetMemberServices)
	r.GET("/service/:namespace/:name", handleGetMemberServiceDetail)
}
