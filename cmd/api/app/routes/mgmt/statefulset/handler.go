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

package statefulset

import (
	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/resource/statefulset"
)

// HandleGetMgmtStatefulSets returns a list of statefulsets in the management cluster
func HandleGetMgmtStatefulSets(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	namespace := common.ParseNamespacePathParameter(c)
	dataSelect := common.ParseDataSelectPathParameter(c)

	klog.InfoS("Get management cluster statefulsets", "namespace", namespace)

	result, err := statefulset.GetStatefulSetList(k8sClient, namespace, dataSelect)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster statefulsets", "namespace", namespace)
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

// HandleGetMgmtStatefulSetDetail returns details for a specific statefulset in the management cluster
func HandleGetMgmtStatefulSetDetail(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	namespace := c.Param("namespace")
	name := c.Param("name")

	klog.InfoS("Get management cluster statefulset detail", "namespace", namespace, "statefulset", name)

	result, err := statefulset.GetStatefulSetDetail(k8sClient, namespace, name)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster statefulset detail", "namespace", namespace, "statefulset", name)
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/statefulset", HandleGetMgmtStatefulSets)
		mgmtRouter.GET("/statefulset/:namespace", HandleGetMgmtStatefulSets)
		mgmtRouter.GET("/statefulset/:namespace/:name", HandleGetMgmtStatefulSetDetail)
	}
	klog.InfoS("Registered management cluster statefulset routes")
}
