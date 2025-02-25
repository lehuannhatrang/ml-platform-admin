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

package node

import (
	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/types"
	// resourcecommon "github.com/karmada-io/dashboard/pkg/resource/common"
	"github.com/karmada-io/dashboard/pkg/resource/node"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func handleGetClusterNode(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	dataSelect := common.ParseDataSelectPathParameter(c)
	result, err := node.GetNodeList(memberClient, dataSelect)
	if err != nil {
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handleGetClusterNodeDetail(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	nodeName := c.Param("nodename")

	// Get node details
	nodeObj, err := memberClient.CoreV1().Nodes().Get(c, nodeName, metav1.GetOptions{})
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Convert to our Node type
	result := node.Node{
		ObjectMeta: types.ObjectMeta{
			Name:              nodeObj.Name,
			Namespace:         nodeObj.Namespace,
			Labels:           nodeObj.Labels,
			Annotations:      nodeObj.Annotations,
			CreationTimestamp: nodeObj.CreationTimestamp,
		},
		TypeMeta: types.TypeMeta{
			Kind:       "Node",
			Scalable:   false,
		},
		Status: nodeObj.Status,
	}

	common.Success(c, result)
}

func handleGetClusterNodeEvents(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	nodeName := c.Param("nodename")

	// Get all events
	events, err := memberClient.CoreV1().Events("").List(c, metav1.ListOptions{
		FieldSelector: "involvedObject.kind=Node,involvedObject.name=" + nodeName,
	})
	if err != nil {
		common.Fail(c, err)
		return
	}

	// Filter and convert events
	// events := event.GetWarningEvents(eventList.Items)
	// result := &resourcecommon.EventList{
	// 	ListMeta: types.ListMeta{
	// 		TotalItems: len(events),
	// 	},
	// 	Events: events,
	// }

	common.Success(c, events)
}

func handleGetClusterNodePods(c *gin.Context) {
	memberClient := client.InClusterClientForMemberCluster(c.Param("clustername"))
	nodeName := c.Param("nodename")

	// Get pods with field selector
	pods, err := memberClient.CoreV1().Pods("").List(c, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + nodeName,
	})
	if err != nil {
		common.Fail(c, err)
		return
	}

	common.Success(c, pods)
}

func init() {
	r := router.MemberV1()
	r.GET("/node", handleGetClusterNode)
	r.GET("/node/:nodename", handleGetClusterNodeDetail)
	r.GET("/node/:nodename/event", handleGetClusterNodeEvents)
	r.GET("/node/:nodename/pod", handleGetClusterNodePods)
}
