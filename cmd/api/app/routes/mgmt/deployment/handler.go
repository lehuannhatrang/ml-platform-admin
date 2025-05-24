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

package deployment

import (
	"context"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/api/core/v1"
	metaV1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/common/types"
	"github.com/karmada-io/dashboard/pkg/dataselect"
	"github.com/karmada-io/dashboard/pkg/resource/deployment"
	"github.com/karmada-io/dashboard/pkg/resource/event"
	"github.com/karmada-io/dashboard/pkg/resource/pod"
)

// HandleGetMgmtDeployments returns a list of deployments in the management cluster
func HandleGetMgmtDeployments(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	namespace := common.ParseNamespacePathParameter(c)
	dataSelect := common.ParseDataSelectPathParameter(c)
	
	klog.InfoS("Get management cluster deployments", "namespace", namespace)
	
	result, err := deployment.GetDeploymentList(k8sClient, namespace, dataSelect)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster deployments", "namespace", namespace)
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

// HandleGetMgmtDeploymentDetail returns details for a specific deployment in the management cluster
func HandleGetMgmtDeploymentDetail(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	namespace := c.Param("namespace")
	name := c.Param("deployment")
	
	klog.InfoS("Get management cluster deployment detail", "namespace", namespace, "deployment", name)
	
	// Get deployment details
	deploymentDetail, err := deployment.GetDeploymentDetail(k8sClient, namespace, name)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster deployment detail", "namespace", namespace, "deployment", name)
		common.Fail(c, err)
		return
	}
	
	// We need to get pods directly using the Kubernetes API with the labels
	labelSelector := metaV1.FormatLabelSelector(&metaV1.LabelSelector{
		MatchLabels: deploymentDetail.Selector,
	})
	
	// Get pod list using the deployment's label selector
	podList, err := k8sClient.CoreV1().Pods(namespace).List(context.TODO(), metaV1.ListOptions{
		LabelSelector: labelSelector,
	})
	
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster deployment pods", "namespace", namespace, "deployment", name, "labelSelector", labelSelector)
		common.Fail(c, err)
		return
	}
	
	// Convert to dashboard pod list format
	pods := &pod.PodList{
		ListMeta: types.ListMeta{TotalItems: len(podList.Items)},
		Items:    make([]pod.Pod, 0),
		Errors:   []error{},
	}
	
	for _, item := range podList.Items {
		pods.Items = append(pods.Items, pod.Pod{
			ObjectMeta: types.NewObjectMeta(item.ObjectMeta),
			TypeMeta:   types.NewTypeMeta("Pod"),
			Status:     item.Status,
			Spec:       item.Spec,
		})
	}
	
	// Create response with both deployment and pod details
	response := struct {
		*deployment.DeploymentDetail `json:",inline"`
		PodList                      *pod.PodList `json:"podList"`
		PodStatus                    v1.PodPhase  `json:"podStatus,omitempty"`
	}{
		DeploymentDetail: deploymentDetail,
		PodList:          pods,
	}
	
	common.Success(c, response)
}

// HandleGetMgmtDeploymentEvents returns events for a specific deployment in the management cluster
func HandleGetMgmtDeploymentEvents(c *gin.Context) {
	// Get direct client to management cluster
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, errors.NewInternal("Failed to get management cluster client"))
		return
	}

	namespace := c.Param("namespace")
	name := c.Param("deployment")
	
	klog.InfoS("Get management cluster deployment events", "namespace", namespace, "deployment", name)
	
	dataSelect := dataselect.NewDataSelectQuery(dataselect.NoPagination, dataselect.NoSort, dataselect.NoFilter)
	events, err := event.GetResourceEvents(k8sClient, dataSelect, namespace, name)
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster deployment events", "namespace", namespace, "deployment", name)
		common.Fail(c, err)
		return
	}
	common.Success(c, events)
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/deployment", HandleGetMgmtDeployments)
		mgmtRouter.GET("/deployment/:namespace", HandleGetMgmtDeployments)
		mgmtRouter.GET("/deployment/:namespace/:deployment", HandleGetMgmtDeploymentDetail)
		mgmtRouter.GET("/deployment/:namespace/:deployment/event", HandleGetMgmtDeploymentEvents)
	}
	klog.InfoS("Registered management cluster deployment routes")
}
