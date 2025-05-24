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

package daemonset

import (
	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/resource/daemonset"
)

// HandleGetMgmtDaemonsets returns a list of daemonsets in the management cluster
func HandleGetMgmtDaemonsets(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	namespace := common.ParseNamespacePathParameter(c)
	dataSelect := common.ParseDataSelectPathParameter(c)

	klog.InfoS("Get management cluster daemonsets", "namespace", namespace)

	result, err := daemonset.GetDaemonSetList(k8sClient, namespace, dataSelect)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster daemonsets", "namespace", namespace)
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

// HandleGetMgmtDaemonsetDetail returns details for a specific daemonset in the management cluster
func HandleGetMgmtDaemonsetDetail(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	namespace := c.Param("namespace")
	name := c.Param("name")

	klog.InfoS("Get management cluster daemonset detail", "namespace", namespace, "daemonset", name)

	result, err := daemonset.GetDaemonSetDetail(k8sClient, namespace, name)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster daemonset detail", "namespace", namespace, "daemonset", name)
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/daemonset", HandleGetMgmtDaemonsets)
		mgmtRouter.GET("/daemonset/:namespace", HandleGetMgmtDaemonsets)
		mgmtRouter.GET("/daemonset/:namespace/:name", HandleGetMgmtDaemonsetDetail)
	}
	klog.InfoS("Registered management cluster daemonset routes")
}
