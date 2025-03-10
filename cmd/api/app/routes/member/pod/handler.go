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

package pod

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/pod"
)

// return a pods list
func handleGetMemberPod(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	dataSelect := common.ParseDataSelectPathParameter(c)
	nsQuery := common.ParseNamespacePathParameter(c)
	result, err := pod.GetPodList(memberClient, nsQuery, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

// return a pod detail
func handleGetMemberPodDetail(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	namespace := c.Param("namespace")
	name := c.Param("name")
	result, err := pod.GetPodDetail(memberClient, namespace, name)
	if err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

// handleGetPodContainerLogs returns logs from a specific container in a pod with paging support
func handleGetPodContainerLogs(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	namespace := c.Param("namespace")
	name := c.Param("name")
	container := c.Query("container")

	// Get page parameter, default to 1 if not provided
	page, err := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	if err != nil || page < 1 {
		page = 1
	}

	// First get total lines by fetching all logs
	allLogs, err := pod.GetPodLogs(memberClient, namespace, name, pod.LogOptions{
		Container: container,
		Previous:  false,
		TailLines: nil, // nil means all lines
	})
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Calculate total pages (200 lines per page)
	totalPages := (allLogs.TotalLines + 199) / 200 // Round up division

	// Now get the requested page
	tailLines := page * 200
	logs, err := pod.GetPodLogs(memberClient, namespace, name, pod.LogOptions{
		Container: container,
		Previous:  false,
		TailLines: &tailLines,
	})
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, gin.H{
		"logs": logs.Logs,
		"page": page,
		"totalPages": totalPages,
		"totalLines": allLogs.TotalLines,
	})
}

func init() {
	r := router.MemberV1()
	r.GET("/pod", handleGetMemberPod)
	r.GET("/pod/:namespace", handleGetMemberPod)
	r.GET("/pod/:namespace/:name", handleGetMemberPodDetail)
	r.GET("/pod/:namespace/:name/logs", handleGetPodContainerLogs)
}
