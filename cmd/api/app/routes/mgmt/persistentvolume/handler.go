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

package persistentvolume

import (
	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/dataselect"
	"github.com/karmada-io/dashboard/pkg/resource/event"
	"github.com/karmada-io/dashboard/pkg/resource/persistentvolume"
)

// HandleGetMgmtPersistentVolumes returns a list of persistent volumes in the management cluster
func HandleGetMgmtPersistentVolumes(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	dataSelect := common.ParseDataSelectPathParameter(c)

	klog.InfoS("Get management cluster persistent volumes")

	result, err := persistentvolume.GetPersistentVolumeList(k8sClient, dataSelect)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster persistent volumes")
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

// HandleGetMgmtPersistentVolumeDetail returns details for a specific persistent volume in the management cluster
func HandleGetMgmtPersistentVolumeDetail(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")

	klog.InfoS("Get management cluster persistent volume detail", "persistentvolume", name)

	// Get persistent volume details
	pvDetail, err := persistentvolume.GetPersistentVolumeDetail(k8sClient, name)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster persistent volume detail", "persistentvolume", name)
		common.Fail(c, err)
		return
	}

	common.Success(c, pvDetail)
}

// HandleGetMgmtPersistentVolumeEvents returns events for a specific persistent volume in the management cluster
func HandleGetMgmtPersistentVolumeEvents(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")
	
	klog.InfoS("Get management cluster persistent volume events", "persistentvolume", name)
	
	dataSelect := dataselect.NewDataSelectQuery(dataselect.NoPagination, dataselect.NoSort, dataselect.NoFilter)
	result, err := event.GetResourceEvents(k8sClient, dataSelect, "", name)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster persistent volume events", "persistentvolume", name)
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/persistentvolume", HandleGetMgmtPersistentVolumes)
		mgmtRouter.GET("/persistentvolume/:name", HandleGetMgmtPersistentVolumeDetail)
		mgmtRouter.GET("/persistentvolume/:name/event", HandleGetMgmtPersistentVolumeEvents)
	}
	klog.InfoS("Registered management cluster persistent volume routes")
}
