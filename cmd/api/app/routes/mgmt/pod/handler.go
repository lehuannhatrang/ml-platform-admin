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
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/pod"
)

// HandleGetMgmtPods gets all pods in a namespace from the management cluster
func HandleGetMgmtPods(c *gin.Context) {
	// Get the Kubernetes client
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		common.Fail(c, fmt.Errorf("failed to get management cluster client"))
		return
	}
	
	// Parse query parameters
	dataSelect := common.ParseDataSelectPathParameter(c)
	nsQuery := common.ParseNamespacePathParameter(c)
	
	// Use the same pod list function as member clusters
	result, err := pod.GetPodList(k8sClient, nsQuery, dataSelect)
	if err != nil {
		klog.ErrorS(err, "Failed to list pods in management cluster")
		common.Fail(c, err)
		return
	}
	
	common.Success(c, result)
}

// HandleGetMgmtPodDetails gets details of a specific pod in the management cluster
func HandleGetMgmtPodDetails(c *gin.Context) {
	namespace := c.Param("namespace")
	podName := c.Param("name")
	klog.InfoS("Get management cluster pod details", "namespace", namespace, "pod", podName)

	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		common.Fail(c, fmt.Errorf("failed to get management cluster client"))
		return
	}

	// Use the same pod detail function as member clusters
	result, err := pod.GetPodDetail(k8sClient, namespace, podName)
	if err != nil {
		klog.ErrorS(err, "Failed to get pod details in management cluster", "namespace", namespace, "pod", podName)
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

// HandleGetMgmtPodLogs gets logs for a specific pod in the management cluster
func HandleGetMgmtPodLogs(c *gin.Context) {
	namespace := c.Param("namespace")
	podName := c.Param("name")
	container := c.Query("container")

	// Get page parameter, default to 1 if not provided
	page, err := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	if err != nil || page < 1 {
		page = 1
	}

	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		common.Fail(c, fmt.Errorf("failed to get management cluster client"))
		return
	}

	// First get total lines by fetching all logs
	allLogs, err := pod.GetPodLogs(k8sClient, namespace, podName, pod.LogOptions{
		Container: container,
		Previous:  false,
		TailLines: nil, // nil means all lines
	})
	if err != nil {
		klog.ErrorS(err, "Failed to get pod logs in management cluster", "namespace", namespace, "pod", podName)
		common.Fail(c, err)
		return
	}

	// Calculate total pages (200 lines per page)
	totalPages := (allLogs.TotalLines + 199) / 200 // Round up division

	// Now get the requested page
	tailLines := page * 200
	logs, err := pod.GetPodLogs(k8sClient, namespace, podName, pod.LogOptions{
		Container: container,
		Previous:  false,
		TailLines: &tailLines,
	})
	if err != nil {
		klog.ErrorS(err, "Failed to get pod logs in management cluster", "namespace", namespace, "pod", podName)
		common.Fail(c, err)
		return
	}

	common.Success(c, gin.H{
		"logs":       logs.Logs,
		"page":       page,
		"totalPages": totalPages,
		"totalLines": allLogs.TotalLines,
	})
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		// Add all management cluster pod-related routes
		mgmtRouter.GET("/pod", HandleGetMgmtPods)
		mgmtRouter.GET("/pod/:namespace", HandleGetMgmtPods)
		mgmtRouter.GET("/pod/:namespace/:name", HandleGetMgmtPodDetails)
		mgmtRouter.GET("/pod/:namespace/:name/logs", HandleGetMgmtPodLogs)
	}
	klog.InfoS("Registered management cluster pod routes")
}
