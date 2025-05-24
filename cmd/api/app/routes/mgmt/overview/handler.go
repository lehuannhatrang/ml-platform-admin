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

package overview

import (
	"context"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/pkg/client"
	routesoverview "github.com/karmada-io/dashboard/cmd/api/app/routes/overview"
)

// HandleGetMgmtOverview returns overview data for the management cluster
func HandleGetMgmtOverview(c *gin.Context) {
	// Get the global overview first
	karmadaInfo, err := routesoverview.GetControllerManagerInfo()
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		common.Fail(c, err)
		return
	}

	// Get node count
	nodeList, err := k8sClient.CoreV1().Nodes().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Count ready nodes
	totalNodes := len(nodeList.Items)
	readyNodes := 0
	for _, node := range nodeList.Items {
		for _, condition := range node.Status.Conditions {
			if condition.Type == "Ready" && condition.Status == "True" {
				readyNodes++
				break
			}
		}
	}

	// Get namespace count
	namespaceList, err := k8sClient.CoreV1().Namespaces().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Get pod count
	podList, err := k8sClient.CoreV1().Pods("").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Get service count - using this for the UI even though we don't display it yet
	_, err = k8sClient.CoreV1().Services("").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Calculate resource metrics
	var totalCPU int64 = 0
	var totalMemory int64 = 0
	var totalPods int64 = 0
	var allocatedPods int64 = 0
	
	// Define CPU and memory utilization percentages for metrics calculation
	// These values would ideally be calculated from actual usage metrics
	// For now, use conservative estimates similar to what's in the main overview API
	cpuUtilizationPercent := 40.0 // Assume 40% CPU utilization
	memoryUtilizationPercent := 50.0 // Assume 50% memory utilization
	
	// Get CPU, memory, and pod metrics from nodes
	for _, node := range nodeList.Items {
		// Add CPU capacity
		cpuQuantity := node.Status.Capacity.Cpu()
		if cpuQuantity != nil {
			totalCPU += cpuQuantity.Value()
		}
		
		// Add memory capacity
		// Memory values in the main overview API are in bytes, so we keep the same unit
		memQuantity := node.Status.Capacity.Memory()
		if memQuantity != nil {
			totalMemory += memQuantity.Value()
		}
		
		// Add pod capacity
		podQuantity := node.Status.Capacity.Pods()
		if podQuantity != nil {
			totalPods += podQuantity.Value()
		}
	}
	
	// Calculate allocated resources using the same formula as the main overview API
	// allocatedCPU = totalCPU * cpuUtilizationPercent / 100
	allocatedCPU := float64(totalCPU) * cpuUtilizationPercent / 100
	allocatedMemory := float64(totalMemory) * memoryUtilizationPercent / 100
	
	// Count running pods as allocated
	allocatedPods = int64(len(podList.Items))
	
	// Build response
	overview := v1.MemberOverviewResponse{
		KarmadaInfo: karmadaInfo,
		ClusterName: "mgmt-cluster",
		ArgoMetrics: &v1.ArgoMetrics{
			ApplicationCount: 0,
			ProjectCount: 0,
		},
		DeploymentCount: 0,
		MemberClusterStatus: &v1.MemberClusterStatus{
			NodeSummary: &v1.NodeSummary{
				TotalNum: int32(totalNodes),
				ReadyNum: int32(readyNodes),
			},
			CPUSummary: &v1.CPUSummary{
				TotalCPU: totalCPU,
				AllocatedCPU: allocatedCPU,
			},
			MemorySummary: &v1.MemorySummary{
				TotalMemory: totalMemory,
				AllocatedMemory: allocatedMemory,
			},
			PodSummary: &v1.PodSummary{
				TotalPod: totalPods,
				AllocatedPod: allocatedPods,
			},
		},
		MetricsDashboards: []v1.MetricsDashboard{},
		NamespaceCount: len(namespaceList.Items),
	}

	common.Success(c, overview)
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/overview", HandleGetMgmtOverview)
	}
	klog.InfoS("Registered management cluster overview routes")
}
