package overview

import (
	"context"
	"fmt"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	routesoverview "github.com/karmada-io/dashboard/cmd/api/app/routes/overview"
	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/config"
)

// HandleGetMemberOverview returns overview data for a specific member cluster
func HandleGetMemberOverview(c *gin.Context) {
	clusterName := c.Param("clustername")

	// Get the global overview first
	karmadaInfo, err := routesoverview.GetControllerManagerInfo()
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Get the ArgoCD metrics
	argoMetrics, err := GetMemberArgoMetrics(c, clusterName)
	if err != nil {
		// Don't fail if we can't get ArgoCD metrics
		argoMetrics = &v1.ArgoMetrics{
			ApplicationCount: 0,
			ProjectCount:     0,
		}
	}

	// Get deployment count for this member cluster
	deploymentCount, err := GetMemberDeploymentCount(clusterName)
	if err != nil {
		deploymentCount = 0
	}

	// Get member cluster resource status information
	memberClusterStatus, err := GetMemberClusterStatus(clusterName)
	if err != nil {
		// Don't fail completely, create an empty status
		memberClusterStatus = &v1.MemberClusterStatus{
			NodeSummary: &v1.NodeSummary{
				ReadyNum: 0,
				TotalNum: 0,
			},
			PodSummary: &v1.PodSummary{
				AllocatedPod: 0,
				TotalPod:     0,
			},
			CPUSummary: &v1.CPUSummary{
				AllocatedCPU: 0,
				TotalCPU:     0,
			},
			MemorySummary: &v1.MemorySummary{
				AllocatedMemory: 0,
				TotalMemory:     0,
			},
		}
	}

	// Get metrics dashboards
	metricsDashboards, err := GetMetricsDashboards()
	if err != nil {
		// Don't fail if we can't get metrics dashboards
		metricsDashboards = []v1.MetricsDashboard{}
	}
	
	// Get namespace count
	namespaceCount, err := GetMemberNamespaceCount(clusterName)
	if err != nil {
		namespaceCount = 0
	}

	// Create member overview response
	response := v1.MemberOverviewResponse{
		KarmadaInfo:         karmadaInfo,
		ClusterName:         clusterName,
		ArgoMetrics:         argoMetrics,
		DeploymentCount:     deploymentCount,
		MemberClusterStatus: memberClusterStatus,
		MetricsDashboards:   metricsDashboards,
		NamespaceCount:      namespaceCount,
	}

	common.Success(c, response)
}

// GetMemberArgoMetrics retrieves ArgoCD application and project counts from a specific member cluster
func GetMemberArgoMetrics(c *gin.Context, clusterName string) (*v1.ArgoMetrics, error) {
	ctx := context.TODO()

	// Define the GVRs for ArgoCD resources
	applicationGVR := schema.GroupVersionResource{
		Group:    "argoproj.io",
		Version:  "v1alpha1",
		Resource: "applications",
	}

	projectGVR := schema.GroupVersionResource{
		Group:    "argoproj.io",
		Version:  "v1alpha1",
		Resource: "appprojects",
	}

	// Create a dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		return nil, err
	}

	// Count applications
	var applicationCount, projectCount int
	applications, err := dynamicClient.Resource(applicationGVR).List(ctx, metav1.ListOptions{})
	if err == nil {
		applicationCount = len(applications.Items)
	}

	// Count projects
	projects, err := dynamicClient.Resource(projectGVR).List(ctx, metav1.ListOptions{})
	if err == nil {
		projectCount = len(projects.Items)
	}

	return &v1.ArgoMetrics{
		ApplicationCount: applicationCount,
		ProjectCount:     projectCount,
	}, nil
}

// GetMemberDeploymentCount returns the count of deployments in a specific member cluster
func GetMemberDeploymentCount(clusterName string) (int, error) {
	ctx := context.TODO()

	// Get client for the member cluster
	memberClient := client.InClusterClientForMemberCluster(clusterName)
	if memberClient == nil {
		return 0, nil
	}

	// Get deployments from all namespaces
	deployments, err := memberClient.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, err
	}

	// Count only ready deployments
	readyCount := 0
	for _, deployment := range deployments.Items {
		if deployment.Status.ReadyReplicas == deployment.Status.Replicas {
			readyCount++
		}
	}

	return readyCount, nil
}

// GetMemberNodeSummary returns the node summary for a specific member cluster
func GetMemberNodeSummary(clusterName string) (*v1.NodeSummary, error) {
	ctx := context.TODO()

	// Get client for the member cluster
	memberClient := client.InClusterClientForMemberCluster(clusterName)
	if memberClient == nil {
		return nil, fmt.Errorf("failed to get client for member cluster %s", clusterName)
	}

	// Get all nodes in the member cluster
	nodes, err := memberClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var readyNum int32
	totalNum := int32(len(nodes.Items))

	// Count ready nodes
	for _, node := range nodes.Items {
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
				readyNum++
				break
			}
		}
	}

	return &v1.NodeSummary{
		ReadyNum: readyNum,
		TotalNum: totalNum,
	}, nil
}

// GetMemberClusterStatus retrieves resource status information from a specific member cluster
func GetMemberClusterStatus(clusterName string) (*v1.MemberClusterStatus, error) {
	ctx := context.TODO()

	// Get client for the member cluster
	memberClient := client.InClusterClientForMemberCluster(clusterName)
	if memberClient == nil {
		return nil, fmt.Errorf("failed to get client for member cluster %s", clusterName)
	}

	// Initialize the member cluster status
	memberClusterStatus := &v1.MemberClusterStatus{
		NodeSummary:   &v1.NodeSummary{},
		PodSummary:    &v1.PodSummary{},
		CPUSummary:    &v1.CPUSummary{},
		MemorySummary: &v1.MemorySummary{},
	}

	// Get and process node information
	nodes, err := memberClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var readyNodeCount int32
	var totalCPU int64
	var totalMemory int64

	// Count nodes and sum resources
	for _, node := range nodes.Items {
		// Count ready nodes
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
				readyNodeCount++
				break
			}
		}

		// Sum CPU and memory capacity
		cpuQuantity := node.Status.Capacity[corev1.ResourceCPU]
		memoryQuantity := node.Status.Capacity[corev1.ResourceMemory]

		totalCPU += cpuQuantity.MilliValue()
		totalMemory += memoryQuantity.Value()
	}

	// Populate node summary
	memberClusterStatus.NodeSummary.TotalNum = int32(len(nodes.Items))
	memberClusterStatus.NodeSummary.ReadyNum = readyNodeCount

	// Get pod information
	pods, err := memberClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err == nil {
		// Count pods and sum allocated resources
		var allocatedCPU int64
		var allocatedMemory int64

		for _, pod := range pods.Items {
			// Only count running pods
			if pod.Status.Phase == corev1.PodRunning {
				for _, container := range pod.Spec.Containers {
					// Sum CPU requests
					if cpuRequest, ok := container.Resources.Requests[corev1.ResourceCPU]; ok {
						allocatedCPU += cpuRequest.MilliValue()
					}

					// Sum memory requests
					if memoryRequest, ok := container.Resources.Requests[corev1.ResourceMemory]; ok {
						allocatedMemory += memoryRequest.Value()
					}
				}
			}
		}

		// Populate pod summary - use int64 as per API definition
		memberClusterStatus.PodSummary.AllocatedPod = int64(len(pods.Items))

		// Calculate pod capacity from nodes
		var totalPods int64
		for _, node := range nodes.Items {
			if podCapacity, ok := node.Status.Capacity[corev1.ResourcePods]; ok {
				totalPods += podCapacity.Value()
			}
		}
		memberClusterStatus.PodSummary.TotalPod = totalPods

		// Calculate CPU fraction as a percentage
		var cpuFraction float64
		if totalCPU > 0 {
			cpuFraction = float64(allocatedCPU) / float64(totalCPU) * 100
		}

		// Calculate memory fraction as a percentage
		var memoryFraction float64
		if totalMemory > 0 {
			memoryFraction = float64(allocatedMemory) / float64(totalMemory) * 100
		}

		// Populate CPU summary - totalCPU is the capacity in cores
		memberClusterStatus.CPUSummary.TotalCPU = totalCPU / 1000
		// AllocatedCPU calculated as a fraction of total capacity
		memberClusterStatus.CPUSummary.AllocatedCPU = float64(totalCPU/1000) * cpuFraction / 100

		// Populate memory summary - totalMemory is the capacity in bytes
		memberClusterStatus.MemorySummary.TotalMemory = totalMemory
		// AllocatedMemory calculated as a fraction of total capacity
		memberClusterStatus.MemorySummary.AllocatedMemory = float64(totalMemory) * memoryFraction / 100
	}

	return memberClusterStatus, nil
}

// GetMemberNamespaceCount returns the number of namespaces in a specific member cluster
func GetMemberNamespaceCount(clusterName string) (int, error) {
	ctx := context.TODO()
	
	// Get client for the member cluster
	memberClient := client.InClusterClientForMemberCluster(clusterName)
	if memberClient == nil {
		return 0, fmt.Errorf("failed to get client for member cluster %s", clusterName)
	}

	// List all namespaces in the member cluster
	namespaces, err := memberClient.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, err
	}

	return len(namespaces.Items), nil
}

// GetMetricsDashboards returns the metrics dashboards configuration
func GetMetricsDashboards() ([]v1.MetricsDashboard, error) {
	cfg := config.GetDashboardConfig()
	var dashboards []v1.MetricsDashboard
	if cfg.MetricsDashboards != nil {
		for _, d := range cfg.MetricsDashboards {
			dashboards = append(dashboards, v1.MetricsDashboard{
				Name: d.Name,
				URL:  d.URL,
			})
		}
	}
	return dashboards, nil
}

func init() {
	r := router.MemberV1()
	r.GET("/overview", HandleGetMemberOverview)
}
