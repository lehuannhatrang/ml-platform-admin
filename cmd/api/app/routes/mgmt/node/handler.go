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
	"github.com/karmada-io/dashboard/pkg/resource/node"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"
)

func handleGetMgmtNode(c *gin.Context) {
	klog.InfoS("Get management cluster node list")
	// Use direct client to management cluster
	memberClient := client.InClusterClient()
	dataSelect := common.ParseDataSelectPathParameter(c)
	result, err := node.GetNodeList(memberClient, dataSelect)
	if err != nil {
		klog.ErrorS(err, "Get management cluster node list failed")
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handleGetMgmtNodeDetail(c *gin.Context) {
	// Use direct client to management cluster
	memberClient := client.InClusterClient()
	nodeName := c.Param("nodename")
	klog.InfoS("Get management cluster node detail", "nodename", nodeName)

	// Get node details
	nodeObj, err := memberClient.CoreV1().Nodes().Get(c, nodeName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Get management cluster node detail failed", "nodename", nodeName)
		common.Fail(c, err)
		return
	}

	// Convert to our Node type
	result := node.Node{
		ObjectMeta: types.ObjectMeta{
			Name:              nodeObj.Name,
			Namespace:         nodeObj.Namespace,
			Labels:            nodeObj.Labels,
			Annotations:       nodeObj.Annotations,
			CreationTimestamp: nodeObj.CreationTimestamp,
		},
		TypeMeta: types.TypeMeta{
			Kind:     "Node",
			Scalable: false,
		},
		Status: nodeObj.Status,
	}

	common.Success(c, result)
}

func handleGetMgmtNodeEvents(c *gin.Context) {
	// Use direct client to management cluster
	memberClient := client.InClusterClient()
	nodeName := c.Param("nodename")
	klog.InfoS("Get management cluster node events", "nodename", nodeName)

	// Get all events
	events, err := memberClient.CoreV1().Events("").List(c, metav1.ListOptions{
		FieldSelector: "involvedObject.kind=Node,involvedObject.name=" + nodeName,
	})
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster node events", "nodename", nodeName)
		common.Fail(c, err)
		return
	}

	// Return the events in the same format as member cluster
	common.Success(c, events)
}

func handleGetMgmtNodePods(c *gin.Context) {
	// Use direct client to management cluster
	memberClient := client.InClusterClient()
	nodeName := c.Param("nodename")
	klog.InfoS("Get management cluster node pods", "nodename", nodeName)

	// Get pods with field selector
	pods, err := memberClient.CoreV1().Pods("").List(c, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + nodeName,
	})
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster node pods", "nodename", nodeName)
		common.Fail(c, err)
		return
	}

	// Return the pods in the same format as member cluster
	common.Success(c, pods)
}

func init() {
	mgmtRouter := router.Mgmt()
	{
		mgmtRouter.GET("/node", handleGetMgmtNode)
		mgmtRouter.GET("/node/:nodename", handleGetMgmtNodeDetail)
		mgmtRouter.GET("/node/:nodename/event", handleGetMgmtNodeEvents)
		mgmtRouter.GET("/node/:nodename/pod", handleGetMgmtNodePods)
	}
	klog.InfoS("Registered management cluster node routes")
}
