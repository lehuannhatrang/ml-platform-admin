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
	"context"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	apiv1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/common/types"
	"github.com/karmada-io/dashboard/pkg/resource/event"
	ns "github.com/karmada-io/dashboard/pkg/resource/namespace"
	"github.com/karmada-io/dashboard/pkg/dataselect"
)

// HandleGetMgmtNamespaces returns a list of namespaces in the management cluster
func HandleGetMgmtNamespaces(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	dataSelect := common.ParseDataSelectPathParameter(c)
	result, err := ns.GetNamespaceList(k8sClient, dataSelect)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster namespaces")
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

// HandleGetMgmtNamespaceDetail returns details for a specific namespace in the management cluster
func HandleGetMgmtNamespaceDetail(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")
	klog.InfoS("Get management cluster namespace detail", "namespace", name)
	
	result, err := ns.GetNamespaceDetail(k8sClient, name)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster namespace detail", "namespace", name)
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

// HandleGetMgmtNamespaceEvents returns events for a specific namespace in the management cluster
func HandleGetMgmtNamespaceEvents(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")
	klog.InfoS("Get management cluster namespace events", "namespace", name)
	
	dataSelect := dataselect.NewDataSelectQuery(dataselect.NoPagination, dataselect.NoSort, dataselect.NoFilter)
	events, err := event.GetNamespaceEvents(k8sClient, dataSelect, name)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster namespace events", "namespace", name)
		common.Fail(c, err)
		return
	}
	common.Success(c, events)
}

// HandleCreateMgmtNamespace creates a new namespace in the management cluster
func HandleCreateMgmtNamespace(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	var createRequest apiv1.CreateNamesapceRequest
	if err := c.ShouldBindJSON(&createRequest); err != nil {
		klog.ErrorS(err, "Failed to bind JSON for namespace creation")
		common.Fail(c, errors.NewBadRequest(err.Error()))
		return
	}

	klog.InfoS("Create management cluster namespace", "namespace", createRequest.Name)
	
	// Create the namespace directly
	nsObj := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: createRequest.Name,
		},
	}
	
	// Create the namespace
	createdNs, err := k8sClient.CoreV1().Namespaces().Create(context.TODO(), nsObj, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create management cluster namespace", "namespace", createRequest.Name)
		common.Fail(c, err)
		return
	}
	
	// Convert to our namespace representation
	result := ns.Namespace{
		ObjectMeta: types.NewObjectMeta(createdNs.ObjectMeta),
		TypeMeta:   types.NewTypeMeta("Namespace"),
		Phase:      createdNs.Status.Phase,
	}
	
	common.Success(c, result)
}

// HandleDeleteMgmtNamespace deletes a namespace from the management cluster
func HandleDeleteMgmtNamespace(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")
	klog.InfoS("Delete management cluster namespace", "namespace", name)
	
	err := k8sClient.CoreV1().Namespaces().Delete(c, name, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete management cluster namespace", "namespace", name)
		common.Fail(c, err)
		return
	}
	common.Success(c, gin.H{"message": "Namespace deleted successfully"})
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/namespace", HandleGetMgmtNamespaces)
		mgmtRouter.GET("/namespace/:name", HandleGetMgmtNamespaceDetail)
		mgmtRouter.GET("/namespace/:name/event", HandleGetMgmtNamespaceEvents)
		mgmtRouter.POST("/namespace", HandleCreateMgmtNamespace)
		mgmtRouter.DELETE("/namespace/:name", HandleDeleteMgmtNamespace)
	}
	klog.InfoS("Registered management cluster namespace routes")
}
