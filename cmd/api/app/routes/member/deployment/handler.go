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
	"time"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/api/core/v1"
	metaV1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

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

func handleRestartMemberDeployment(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	namespace := c.Param("namespace")
	name := c.Param("deployment")

	// First, get the deployment to check if it exists
	deployment, err := memberClient.AppsV1().Deployments(namespace).Get(
		context.TODO(),
		name,
		metaV1.GetOptions{},
	)
	if err != nil {
		klog.Errorf("Failed to get deployment %s/%s: %v", namespace, name, err)
		common.Fail(c, err)
		return
	}

	// Create a patch to update the kubectl.kubernetes.io/restartedAt annotation with current timestamp
	timestamp := time.Now().Format(time.RFC3339)
	// Force restart by setting a new timestamp annotation
	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}
	deployment.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = timestamp

	// Update the deployment
	_, err = memberClient.AppsV1().Deployments(namespace).Update(
		context.TODO(),
		deployment,
		metaV1.UpdateOptions{},
	)

	if err != nil {
		klog.Errorf("Failed to restart deployment %s/%s: %v", namespace, name, err)
		common.Fail(c, err)
		return
	}

	// Use a simple struct for response with proper JSON tags
	type RestartResponse struct {
		Message   string `json:"message"`
		Timestamp string `json:"timestamp"`
	}

	resp := RestartResponse{
		Message:   "Deployment restarted successfully",
		Timestamp: timestamp,
	}

	// Use gin's standard response function
	c.JSON(200, resp)
}

func init() {
	r := router.MemberV1()
	r.GET("/deployment", handleGetMemberDeployments)
	r.GET("/deployment/:namespace", handleGetMemberDeployments)
	r.GET("/deployment/:namespace/:deployment", handleGetMemberDeploymentDetail)
	r.GET("/deployment/:namespace/:deployment/event", handleGetMemberDeploymentEvents)
	r.POST("/deployment/:namespace/:deployment/restart", handleRestartMemberDeployment)
}
