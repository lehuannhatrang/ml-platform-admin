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
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/config"
)

func getMetricsDashboards() []v1.MetricsDashboard {
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
	return dashboards
}

func handleGetOverview(c *gin.Context) {
	dataSelect := common.ParseDataSelectPathParameter(c)
	karmadaInfo, err := GetControllerManagerInfo()
	if err != nil {
		common.Fail(c, err)
		return
	}
	memberClusterStatus, err := GetMemberClusterInfo(dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}

	clusterResourceStatus, err := GetClusterResourceStatus()
	if err != nil {
		common.Fail(c, err)
		return
	}

	metricsDashboards := getMetricsDashboards()

	common.Success(c, v1.OverviewResponse{
		KarmadaInfo:           karmadaInfo,
		MemberClusterStatus:   memberClusterStatus,
		ClusterResourceStatus: clusterResourceStatus,
		MetricsDashboards:     metricsDashboards,
	})
}

type DashboardConfig struct {
	Name string `json:"name" binding:"required"`
	URL  string `json:"url" binding:"required,url"`
}

func handleSaveDashboard(c *gin.Context) {
	var dashboardConfig DashboardConfig
	if err := c.ShouldBindJSON(&dashboardConfig); err != nil {
		common.Fail(c, fmt.Errorf("invalid request body: %w", err))
		return
	}

	// Get kubernetes client
	kubeClient := client.InClusterClient()

	// Get current dashboard config
	currentConfig := config.GetDashboardConfig()

	// Check for duplicate name
	for _, d := range currentConfig.MetricsDashboards {
		if d.Name == dashboardConfig.Name {
			common.Fail(c, fmt.Errorf("dashboard with name '%s' already exists", dashboardConfig.Name))
			return
		}
	}

	// Add new dashboard
	currentConfig.MetricsDashboards = append(currentConfig.MetricsDashboards, config.MetricsDashboard{
		Name: dashboardConfig.Name,
		URL:  dashboardConfig.URL,
	})

	// Update dashboard config
	if err := config.UpdateDashboardConfig(kubeClient, currentConfig); err != nil {
		common.Fail(c, fmt.Errorf("failed to update dashboard config: %w", err))
		return
	}

	common.Success(c, gin.H{"message": "Dashboard saved successfully"})
}

func handleDeleteDashboard(c *gin.Context) {
	name := c.Param("name")
	url := c.Query("url")

	if name == "" || url == "" {
		common.Fail(c, fmt.Errorf("name and url parameters are required"))
		return
	}

	// Get kubernetes client
	kubeClient := client.InClusterClient()

	// Get current dashboard config
	currentConfig := config.GetDashboardConfig()

	// Find and remove the dashboard
	found := false
	updatedDashboards := make([]config.MetricsDashboard, 0, len(currentConfig.MetricsDashboards))
	for _, d := range currentConfig.MetricsDashboards {
		if d.Name == name && d.URL == url {
			found = true
			continue
		}
		updatedDashboards = append(updatedDashboards, d)
	}

	if !found {
		common.Fail(c, fmt.Errorf("dashboard with name '%s' and url '%s' not found", name, url))
		return
	}

	// Update the metrics dashboards
	currentConfig.MetricsDashboards = updatedDashboards

	// Update dashboard config
	if err := config.UpdateDashboardConfig(kubeClient, currentConfig); err != nil {
		common.Fail(c, fmt.Errorf("failed to update dashboard config: %w", err))
		return
	}

	common.Success(c, gin.H{"message": "Dashboard deleted successfully"})
}

func init() {
	/*
		创建时间	2024-01-01
		节点数量：20/20
		CPU使用情况：10000m/20000m
		Memory使用情况：50GiB/500GiB
		Pod分配情况：300/1000
	*/
	r := router.V1()
	r.GET("/overview", handleGetOverview)
	r.POST("/overview/monitoring/dashboard", handleSaveDashboard)
	r.DELETE("/overview/monitoring/dashboard/:name", handleDeleteDashboard)
}
