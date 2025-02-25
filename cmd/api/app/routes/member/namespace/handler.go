/*
Copyright 2024 The Karmada Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package namespace

import (
	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/event"
	ns "github.com/karmada-io/dashboard/pkg/resource/namespace"
	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func handleGetMemberNamespace(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))

	dataSelect := common.ParseDataSelectPathParameter(c)
	result, err := ns.GetNamespaceList(memberClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handleGetMemberNamespaceDetail(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))

	name := c.Param("name")
	result, err := ns.GetNamespaceDetail(memberClient, name)
	if err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handleGetMemberNamespaceEvents(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))

	name := c.Param("name")
	dataSelect := common.ParseDataSelectPathParameter(c)
	result, err := event.GetNamespaceEvents(memberClient, dataSelect, name)
	if err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handleCreateNamespace(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))

	createNamespaceRequest := new(v1.CreateNamesapceRequest)

	if err := c.ShouldBind(&createNamespaceRequest); err != nil {
		common.Fail(c, err)
		return
	}
	spec := &ns.NamespaceSpec{
		Name: createNamespaceRequest.Name,
	}

	if err := ns.CreateNamespace(spec, memberClient); err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, "ok")
}

func handleDeleteNamespace(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	namespaceName := c.Param("name")

	// Delete the namespace
	err := memberClient.CoreV1().Namespaces().Delete(c, namespaceName, metav1.DeleteOptions{})
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, "ok")
}

func init() {
	r := router.MemberV1()
	r.GET("/namespace", handleGetMemberNamespace)
	r.GET("/namespace/:name", handleGetMemberNamespaceDetail)
	r.GET("/namespace/:name/event", handleGetMemberNamespaceEvents)
	r.POST("/namespace", handleCreateNamespace)
	r.DELETE("/namespace/:name", handleDeleteNamespace)
}
