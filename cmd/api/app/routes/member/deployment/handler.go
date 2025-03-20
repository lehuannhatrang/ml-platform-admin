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

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/types"
	"github.com/karmada-io/dashboard/pkg/resource/deployment"
	"github.com/karmada-io/dashboard/pkg/resource/event"
	"github.com/karmada-io/dashboard/pkg/resource/pod"
)

func handleGetMemberDeployments(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	namespace := common.ParseNamespacePathParameter(c)
	dataSelect := common.ParseDataSelectPathParameter(c)
	result, err := deployment.GetDeploymentList(memberClient, namespace, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handleGetMemberDeploymentDetail(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	namespace := c.Param("namespace")
	name := c.Param("deployment")
	
	// Get deployment details
	deploymentDetail, err := deployment.GetDeploymentDetail(memberClient, namespace, name)
	if err != nil {
		common.Fail(c, err)
		return
	}
	
	// We need to get pods directly using the Kubernetes API with the labels
	labelSelector := metaV1.FormatLabelSelector(&metaV1.LabelSelector{
		MatchLabels: deploymentDetail.Selector,
	})
	
	// Get pod list using the deployment's label selector
	podList, err := memberClient.CoreV1().Pods(namespace).List(context.TODO(), metaV1.ListOptions{
		LabelSelector: labelSelector,
	})
	
	if err != nil {
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

func handleGetMemberDeploymentEvents(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	namespace := c.Param("namespace")
	name := c.Param("deployment")
	dataSelect := common.ParseDataSelectPathParameter(c)
	result, err := event.GetResourceEvents(memberClient, dataSelect, namespace, name)
	if err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func init() {
	r := router.MemberV1()
	r.GET("/deployment", handleGetMemberDeployments)
	r.GET("/deployment/:namespace", handleGetMemberDeployments)
	r.GET("/deployment/:namespace/:deployment", handleGetMemberDeploymentDetail)
	r.GET("/deployment/:namespace/:deployment/event", handleGetMemberDeploymentEvents)
}
