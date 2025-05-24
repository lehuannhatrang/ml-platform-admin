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

package cluster

import (
	"context"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	clusterv1alpha1 "github.com/karmada-io/karmada/pkg/apis/cluster/v1alpha1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/auth/fga"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/resource/cluster"
	utilauth "github.com/karmada-io/dashboard/pkg/util/utilauth"
)

func handleGetClusterList(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	dataSelect := common.ParseDataSelectPathParameter(c)

	// Get the authenticated username
	username := utilauth.GetAuthenticatedUser(c)

	// Call GetClusterList with the username to filter by permissions
	result, err := cluster.GetClusterList(karmadaClient, dataSelect, username)
	if err != nil {
		klog.ErrorS(err, "GetClusterList failed")
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handleGetClusterDetail(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	name := c.Param("name")
	result, err := cluster.GetClusterDetail(karmadaClient, name)
	if err != nil {
		klog.ErrorS(err, "GetClusterDetail failed")
		common.Fail(c, err)
		return
	}
	common.Success(c, result)
}

func handlePostCluster(c *gin.Context) {
	clusterRequest := new(v1.PostClusterRequest)
	if err := c.ShouldBind(clusterRequest); err != nil {
		klog.ErrorS(err, "Could not read cluster request")
		common.Fail(c, err)
		return
	}
	memberClusterEndpoint, err := parseEndpointFromKubeconfig(clusterRequest.MemberClusterKubeConfig)
	if err != nil {
		klog.ErrorS(err, "Could not parse member cluster endpoint")
		common.Fail(c, err)
		return
	}
	clusterRequest.MemberClusterEndpoint = memberClusterEndpoint
	karmadaClient := client.InClusterKarmadaClient()

	if clusterRequest.SyncMode == clusterv1alpha1.Pull {
		memberClusterClient, err := client.KubeClientSetFromKubeConfig(clusterRequest.MemberClusterKubeConfig)
		if err != nil {
			klog.ErrorS(err, "Generate kubeclient from memberClusterKubeconfig failed")
			common.Fail(c, err)
			return
		}
		_, apiConfig, err := client.GetKarmadaConfig()
		if err != nil {
			klog.ErrorS(err, "Get apiConfig for karmada failed")
			common.Fail(c, err)
			return
		}
		opts := &pullModeOption{
			karmadaClient:          karmadaClient,
			karmadaAgentCfg:        apiConfig,
			memberClusterNamespace: clusterRequest.MemberClusterNamespace,
			memberClusterClient:    memberClusterClient,
			memberClusterName:      clusterRequest.MemberClusterName,
			memberClusterEndpoint:  clusterRequest.MemberClusterEndpoint,
		}
		if err = accessClusterInPullMode(opts); err != nil {
			klog.ErrorS(err, "accessClusterInPullMode failed")
			common.Fail(c, err)
		} else {
			klog.Infof("accessClusterInPullMode success")
			common.Success(c, "ok")
		}
	} else if clusterRequest.SyncMode == clusterv1alpha1.Push {
		memberClusterRestConfig, err := client.LoadeRestConfigFromKubeConfig(clusterRequest.MemberClusterKubeConfig)
		if err != nil {
			klog.ErrorS(err, "Generate rest config from memberClusterKubeconfig failed")
			common.Fail(c, err)
			return
		}
		restConfig, _, err := client.GetKarmadaConfig()
		if err != nil {
			klog.ErrorS(err, "Get restConfig failed")
			common.Fail(c, err)
			return
		}
		opts := &pushModeOption{
			karmadaClient:           karmadaClient,
			clusterName:             clusterRequest.MemberClusterName,
			karmadaRestConfig:       restConfig,
			memberClusterRestConfig: memberClusterRestConfig,
		}
		if err := accessClusterInPushMode(opts); err != nil {
			klog.ErrorS(err, "accessClusterInPushMode failed")
			common.Fail(c, err)
			return
		}
		klog.Infof("accessClusterInPushMode success")
		common.Success(c, "ok")
	} else {
		klog.Errorf("Unknown sync mode %s", clusterRequest.SyncMode)
		common.Fail(c, fmt.Errorf("unknown sync mode %s", clusterRequest.SyncMode))
	}
}

func handlePutCluster(c *gin.Context) {
	clusterRequest := new(v1.PutClusterRequest)
	name := c.Param("name")
	if err := c.ShouldBind(clusterRequest); err != nil {
		klog.ErrorS(err, "Could not read handlePutCluster request")
		common.Fail(c, err)
		return
	}
	karmadaClient := client.InClusterKarmadaClient()
	memberCluster, err := karmadaClient.ClusterV1alpha1().Clusters().Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Get cluster failed")
		common.Fail(c, err)
		return
	}

	// assume that the frontend can fetch the whole labels and taints
	labels := make(map[string]string)
	if clusterRequest.Labels != nil {
		for _, labelItem := range *clusterRequest.Labels {
			labels[labelItem.Key] = labelItem.Value
		}
		memberCluster.Labels = labels
	}

	taints := make([]corev1.Taint, 0)
	if clusterRequest.Taints != nil {
		for _, taintItem := range *clusterRequest.Taints {
			taints = append(taints, corev1.Taint{
				Key:    taintItem.Key,
				Value:  taintItem.Value,
				Effect: taintItem.Effect,
			})
		}
		memberCluster.Spec.Taints = taints
	}

	_, err = karmadaClient.ClusterV1alpha1().Clusters().Update(context.TODO(), memberCluster, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Update cluster failed")
		common.Fail(c, err)
		return
	}
	common.Success(c, "ok")
}

func handleDeleteCluster(c *gin.Context) {
	ctx := context.Context(c)
	clusterRequest := new(v1.DeleteClusterRequest)
	if err := c.ShouldBindUri(&clusterRequest); err != nil {
		common.Fail(c, err)
		return
	}
	clusterName := clusterRequest.MemberClusterName
	karmadaClient := client.InClusterKarmadaClient()
	waitDuration := time.Second * 60

	err := karmadaClient.ClusterV1alpha1().Clusters().Delete(ctx, clusterName, metav1.DeleteOptions{})
	if apierrors.IsNotFound(err) {
		common.Fail(c, fmt.Errorf("no cluster object %s found in karmada control Plane", clusterName))
		return
	}
	if err != nil {
		klog.Errorf("Failed to delete cluster object. cluster name: %s, error: %v", clusterName, err)
		common.Fail(c, err)
		return
	}

	// make sure the given cluster object has been deleted
	err = wait.PollUntilContextTimeout(ctx, 1*time.Second, waitDuration, true, func(ctx context.Context) (done bool, err error) {
		_, err = karmadaClient.ClusterV1alpha1().Clusters().Get(ctx, clusterName, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			return true, nil
		}
		if err != nil {
			klog.Errorf("Failed to get cluster %s. err: %v", clusterName, err)
			return false, err
		}
		klog.Infof("Waiting for the cluster object %s to be deleted", clusterName)
		return false, nil
	})
	if err != nil {
		klog.Errorf("Failed to delete cluster object. cluster name: %s, error: %v", clusterName, err)
		common.Fail(c, err)
		return
	}
	common.Success(c, "ok")
}

func handleGetClusterUsers(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	clusterName := c.Param("name")

	// Get the authenticated user to ensure they have permission
	username := utilauth.GetAuthenticatedUser(c)
	if username == "" {
		common.FailWithStatus(c, fmt.Errorf("unauthorized"), 401)
		return
	}

	// Check if user has permission to view cluster users
	if fga.FGAService != nil {
		hasAccess, err := fga.HasClusterAccess(context.TODO(), fga.FGAService.GetClient(), username, clusterName)
		if err != nil {
			klog.ErrorS(err, "Failed to check access permission", "username", username, "cluster", clusterName)
			common.FailWithStatus(c, fmt.Errorf("failed to check permissions"), 500)
			return
		}

		if !hasAccess {
			common.FailWithStatus(c, fmt.Errorf("forbidden: insufficient permissions to view cluster users"), 403)
			return
		}
	}

	// Get the list of users for this cluster
	result, err := cluster.GetClusterUsers(karmadaClient, clusterName)
	if err != nil {
		klog.ErrorS(err, "GetClusterUsers failed", "clusterName", clusterName)
		common.Fail(c, err)
		return
	}

	common.Success(c, result)
}

func handleUpdateClusterUsers(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()
	clusterName := c.Param("name")

	// Get the authenticated user to ensure they have permission
	username := utilauth.GetAuthenticatedUser(c)
	if username == "" {
		common.FailWithStatus(c, fmt.Errorf("unauthorized"), 401)
		return
	}

	// Check if user has permission to view cluster users
	fgaService := fga.FGAService
	if fgaService != nil {
		// Use HasClusterAccess to check permissions
		hasAccess, err := fga.HasClusterAccess(context.TODO(), fgaService.GetClient(), username, clusterName)
		if err != nil {
			klog.ErrorS(err, "Failed to check access permission", "username", username, "cluster", clusterName)
			common.FailWithStatus(c, fmt.Errorf("failed to check permissions"), 500)
			return
		}

		if !hasAccess {
			common.FailWithStatus(c, fmt.Errorf("forbidden: insufficient permissions to manage cluster users"), 403)
			return
		}

		// For updating users, we need stricter permission - user must be admin or owner
		isSystemAdmin, err := fgaService.Check(context.TODO(), username, "admin", "dashboard", "dashboard")
		if err != nil {
			klog.ErrorS(err, "Failed to check system admin permission", "username", username)
			// Continue with cluster-specific check in case of system check error
		}

		if !isSystemAdmin {
			// Check if user has owner permission on this specific cluster
			isClusterOwner, err := fgaService.Check(context.TODO(), username, "owner", "cluster", clusterName)
			if err != nil {
				klog.ErrorS(err, "Failed to check cluster owner permission", "username", username, "cluster", clusterName)
				common.FailWithStatus(c, fmt.Errorf("failed to check permissions"), 500)
				return
			}

			if !isClusterOwner {
				common.FailWithStatus(c, fmt.Errorf("forbidden: insufficient permissions to manage cluster users"), 403)
				return
			}
		}
	}

	// Parse the request body
	var request struct {
		Users []struct {
			Username string   `json:"username"`
			Roles    []string `json:"roles"`
		} `json:"users"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		common.FailWithStatus(c, fmt.Errorf("invalid request body: %v", err), 400)
		return
	}

	// Validate the request
	if len(request.Users) == 0 {
		common.FailWithStatus(c, fmt.Errorf("users list cannot be empty"), 400)
		return
	}

	// First, check if the cluster exists
	_, err := karmadaClient.ClusterV1alpha1().Clusters().Get(context.TODO(), clusterName, metav1.GetOptions{})
	if err != nil {
		common.FailWithStatus(c, fmt.Errorf("failed to get cluster %s: %v", clusterName, err), 404)
		return
	}

	// Get current user list to check for dashboard admins
	currentUsers, err := cluster.GetClusterUsers(karmadaClient, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get current cluster users", "clusterName", clusterName)
		common.Fail(c, err)
		return
	}

	// Map to track dashboard admins (we can't change their roles)
	dashboardAdmins := make(map[string]bool)
	for _, user := range currentUsers.Users {
		for _, role := range user.Roles {
			// If user has the system admin role, mark them as a dashboard admin
			if role == "admin" {
				dashboardAdmins[user.Username] = true
				break
			}
		}
	}

	// Process each user
	for _, userUpdate := range request.Users {
		// Skip dashboard admins - we can't modify their roles
		if dashboardAdmins[userUpdate.Username] {
			klog.InfoS("Skipping dashboard admin", "username", userUpdate.Username)
			continue
		}

		// Update user roles using the OpenFGA service
		if fgaService != nil {
			// Delete all existing relations for this user
			err := removeUserRolesFromCluster(fgaService, userUpdate.Username, clusterName)
			if err != nil {
				klog.ErrorS(err, "Failed to remove existing roles", "username", userUpdate.Username, "clusterName", clusterName)
				continue
			}

			// Add new roles based on the request
			for _, role := range userUpdate.Roles {
				// Map UI role names to OpenFGA relation names
				relation := role
				if role == "owner" || role == "admin" {
					relation = "owner"
				} else if role == "member" || role == "read" || role == "write" {
					relation = "member"
				}

				err := fgaService.GetClient().WriteTuple(context.TODO(), userUpdate.Username, relation, "cluster", clusterName)
				if err != nil {
					klog.ErrorS(err, "Failed to add role", "username", userUpdate.Username, "role", role, "clusterName", clusterName)
				}
			}
		}
	}

	// Get the updated users list
	updatedUsers, err := cluster.GetClusterUsers(karmadaClient, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get updated cluster users", "clusterName", clusterName)
		common.Fail(c, err)
		return
	}

	common.Success(c, updatedUsers)
}

func removeUserRolesFromCluster(fgaService *fga.Service, username, clusterName string) error {
	// Remove the owner relation if it exists
	ownerErr := fgaService.GetClient().DeleteTuple(context.TODO(), username, "owner", "cluster", clusterName)
	if ownerErr != nil {
		klog.V(4).InfoS("Failed to remove owner role, might not exist", "username", username, "clusterName", clusterName, "error", ownerErr)
	}

	// Remove the member relation if it exists
	memberErr := fgaService.GetClient().DeleteTuple(context.TODO(), username, "member", "cluster", clusterName)
	if memberErr != nil {
		klog.V(4).InfoS("Failed to remove member role, might not exist", "username", username, "clusterName", clusterName, "error", memberErr)
	}

	// Only return an error if both operations failed
	if ownerErr != nil && memberErr != nil {
		return fmt.Errorf("failed to remove roles: %v, %v", ownerErr, memberErr)
	}

	return nil
}

func parseEndpointFromKubeconfig(kubeconfigContents string) (string, error) {
	restConfig, err := client.LoadeRestConfigFromKubeConfig(kubeconfigContents)
	if err != nil {
		return "", err
	}
	return restConfig.Host, nil
}

// Note: getAuthenticatedUser function has been moved to pkg/util/auth/user.go

func init() {
	r := router.V1()
	r.GET("/cluster", handleGetClusterList)
	r.GET("/cluster/:name", handleGetClusterDetail)
	r.GET("/cluster/:name/users", handleGetClusterUsers)
	r.PUT("/cluster/:name/users", handleUpdateClusterUsers)
	r.POST("/cluster", handlePostCluster)
	r.PUT("/cluster/:name", handlePutCluster)
	r.DELETE("/cluster/:name", handleDeleteCluster)
}
