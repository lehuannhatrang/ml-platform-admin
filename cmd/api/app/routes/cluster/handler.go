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

// CAPIClusterRequest represents the request to create a cluster using ClusterAPI
type CAPIClusterRequest struct {
	ClusterName       string `json:"clusterName" binding:"required"`
	CloudProvider     string `json:"cloudProvider" binding:"required"`
	CredentialName    string `json:"credentialName" binding:"required"`
	Region            string `json:"region" binding:"required"`
	NodeCount         int    `json:"nodeCount" binding:"required"`
	MachineType       string `json:"machineType" binding:"required"`
	KubernetesVersion string `json:"kubernetesVersion" binding:"required"`
}

// handlePostCAPICluster handles the creation of a cluster using ClusterAPI
func handlePostCAPICluster(c *gin.Context) {
	var req CAPIClusterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Could not read CAPI cluster request")
		common.Fail(c, err)
		return
	}

	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, fmt.Errorf("failed to get management cluster client"))
		return
	}

	// Verify the credential exists
	secretName := req.CredentialName
	secretNamespace := "ml-platform-system"
	secret, err := k8sClient.CoreV1().Secrets(secretNamespace).Get(context.TODO(), secretName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			klog.ErrorS(err, "Cloud credential not found", "name", secretName)
			common.Fail(c, fmt.Errorf("cloud credential '%s' not found", secretName))
			return
		}
		klog.ErrorS(err, "Failed to get cloud credential", "name", secretName)
		common.Fail(c, err)
		return
	}

	// Verify it's a cloud credential
	if secret.Labels["ml-platform.io/credential-type"] != "cloud-credential" {
		klog.Error("Secret is not a cloud credential", "name", secretName)
		common.Fail(c, fmt.Errorf("secret '%s' is not a cloud credential", secretName))
		return
	}

	// Create the ClusterAPI Cluster resource
	capiCluster := map[string]interface{}{
		"apiVersion": "cluster.x-k8s.io/v1beta1",
		"kind":       "Cluster",
		"metadata": map[string]interface{}{
			"name":      req.ClusterName,
			"namespace": secretNamespace,
			"labels": map[string]string{
				"ml-platform.io/managed":       "true",
				"ml-platform.io/cloud-provider": req.CloudProvider,
			},
		},
		"spec": map[string]interface{}{
			"clusterNetwork": map[string]interface{}{
				"pods": map[string]interface{}{
					"cidrBlocks": []string{"192.168.0.0/16"},
				},
			},
			"controlPlaneRef": map[string]interface{}{
				"apiVersion": getControlPlaneAPIVersion(req.CloudProvider),
				"kind":       getControlPlaneKind(req.CloudProvider),
				"name":       fmt.Sprintf("%s-control-plane", req.ClusterName),
			},
			"infrastructureRef": map[string]interface{}{
				"apiVersion": getInfraAPIVersion(req.CloudProvider),
				"kind":       getInfraClusterKind(req.CloudProvider),
				"name":       req.ClusterName,
			},
		},
	}

	// Create infrastructure cluster resource based on provider
	infraCluster := createInfraClusterResource(req)

	// Create control plane resource
	controlPlane := createControlPlaneResource(req)

	// Create machine deployment for worker nodes
	machineDeployment := createMachineDeploymentResource(req)

	klog.InfoS("Creating CAPI cluster resources", "clusterName", req.ClusterName, "provider", req.CloudProvider)

	// Here you would use the dynamic client to create these resources
	// For now, we'll return a success message indicating the resources would be created
	result := map[string]interface{}{
		"message":           fmt.Sprintf("ClusterAPI resources for cluster '%s' will be created", req.ClusterName),
		"cluster":           capiCluster,
		"infraCluster":      infraCluster,
		"controlPlane":      controlPlane,
		"machineDeployment": machineDeployment,
	}

	common.Success(c, result)
}

func getControlPlaneAPIVersion(provider string) string {
	switch provider {
	case "aws":
		return "controlplane.cluster.x-k8s.io/v1beta1"
	case "gcp":
		return "controlplane.cluster.x-k8s.io/v1beta1"
	case "azure":
		return "controlplane.cluster.x-k8s.io/v1beta1"
	default:
		return "controlplane.cluster.x-k8s.io/v1beta1"
	}
}

func getControlPlaneKind(provider string) string {
	switch provider {
	case "aws":
		return "AWSManagedControlPlane"
	case "gcp":
		return "GCPManagedControlPlane"
	case "azure":
		return "AzureManagedControlPlane"
	default:
		return "KubeadmControlPlane"
	}
}

func getInfraAPIVersion(provider string) string {
	switch provider {
	case "aws":
		return "infrastructure.cluster.x-k8s.io/v1beta1"
	case "gcp":
		return "infrastructure.cluster.x-k8s.io/v1beta1"
	case "azure":
		return "infrastructure.cluster.x-k8s.io/v1beta1"
	default:
		return "infrastructure.cluster.x-k8s.io/v1beta1"
	}
}

func getInfraClusterKind(provider string) string {
	switch provider {
	case "aws":
		return "AWSManagedCluster"
	case "gcp":
		return "GCPManagedCluster"
	case "azure":
		return "AzureManagedCluster"
	default:
		return "DockerCluster"
	}
}

func createInfraClusterResource(req CAPIClusterRequest) map[string]interface{} {
	return map[string]interface{}{
		"apiVersion": getInfraAPIVersion(req.CloudProvider),
		"kind":       getInfraClusterKind(req.CloudProvider),
		"metadata": map[string]interface{}{
			"name":      req.ClusterName,
			"namespace": "ml-platform-system",
		},
		"spec": map[string]interface{}{
			"region": req.Region,
		},
	}
}

func createControlPlaneResource(req CAPIClusterRequest) map[string]interface{} {
	return map[string]interface{}{
		"apiVersion": getControlPlaneAPIVersion(req.CloudProvider),
		"kind":       getControlPlaneKind(req.CloudProvider),
		"metadata": map[string]interface{}{
			"name":      fmt.Sprintf("%s-control-plane", req.ClusterName),
			"namespace": "ml-platform-system",
		},
		"spec": map[string]interface{}{
			"version": req.KubernetesVersion,
		},
	}
}

func createMachineDeploymentResource(req CAPIClusterRequest) map[string]interface{} {
	return map[string]interface{}{
		"apiVersion": "cluster.x-k8s.io/v1beta1",
		"kind":       "MachineDeployment",
		"metadata": map[string]interface{}{
			"name":      fmt.Sprintf("%s-md-0", req.ClusterName),
			"namespace": "ml-platform-system",
		},
		"spec": map[string]interface{}{
			"clusterName": req.ClusterName,
			"replicas":    req.NodeCount,
			"selector": map[string]interface{}{
				"matchLabels": map[string]string{
					"cluster.x-k8s.io/cluster-name": req.ClusterName,
				},
			},
			"template": map[string]interface{}{
				"spec": map[string]interface{}{
					"clusterName": req.ClusterName,
					"version":     req.KubernetesVersion,
					"bootstrap": map[string]interface{}{
						"configRef": map[string]interface{}{
							"apiVersion": "bootstrap.cluster.x-k8s.io/v1beta1",
							"kind":       "KubeadmConfigTemplate",
							"name":       fmt.Sprintf("%s-md-0", req.ClusterName),
						},
					},
					"infrastructureRef": map[string]interface{}{
						"apiVersion": getInfraAPIVersion(req.CloudProvider),
						"kind":       getMachineTemplateKind(req.CloudProvider),
						"name":       fmt.Sprintf("%s-md-0", req.ClusterName),
					},
				},
			},
		},
	}
}

func getMachineTemplateKind(provider string) string {
	switch provider {
	case "aws":
		return "AWSMachineTemplate"
	case "gcp":
		return "GCPMachineTemplate"
	case "azure":
		return "AzureMachineTemplate"
	default:
		return "DockerMachineTemplate"
	}
}

func init() {
	r := router.V1()
	r.GET("/cluster", handleGetClusterList)
	r.GET("/cluster/:name", handleGetClusterDetail)
	r.GET("/cluster/:name/users", handleGetClusterUsers)
	r.PUT("/cluster/:name/users", handleUpdateClusterUsers)
	r.POST("/cluster", handlePostCluster)
	r.POST("/cluster/capi", handlePostCAPICluster)
	r.PUT("/cluster/:name", handlePutCluster)
	r.DELETE("/cluster/:name", handleDeleteCluster)
}
