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

package backup

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	clusterv1alpha1 "github.com/karmada-io/karmada/pkg/apis/cluster/v1alpha1"
	policyv1alpha1 "github.com/karmada-io/karmada/pkg/apis/policy/v1alpha1"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/dynamic"

	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/config"
)

// ClusterInfo represents cluster information with migration controller status
type ClusterInfo struct {
	Name                       string `json:"name"`
	Type                       string `json:"type"`                      // "management" or "member"
	Status                     string `json:"status"`                    // "Ready", "NotReady", "Unknown"
	MigrationControllerStatus  string `json:"migrationControllerStatus"` // "installed", "not-installed", "error"
	MigrationControllerVersion string `json:"migrationControllerVersion,omitempty"`
	KubeVersion                string `json:"kubeVersion,omitempty"`
	NodeCount                  int    `json:"nodeCount"`
	LastChecked                string `json:"lastChecked"`
	Error                      string `json:"error,omitempty"`
}

// InstallControllerRequest represents the request to install migration controller
type InstallControllerRequest struct {
	ClusterName string `json:"clusterName" binding:"required"`
	Version     string `json:"version,omitempty"` // defaults to v2.0
}

// UninstallControllerRequest represents the request to uninstall migration controller
type UninstallControllerRequest struct {
	ClusterName string `json:"clusterName" binding:"required"`
}

// handleGetClusters retrieves all clusters with migration controller status
func handleGetClusters(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	// Get management cluster info
	mgmtCluster := getManagementClusterInfo()

	// Get member clusters
	clusterList, err := karmadaClient.ClusterV1alpha1().Clusters().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list member clusters")
		common.Fail(c, err)
		return
	}

	clusters := make([]ClusterInfo, 0, len(clusterList.Items)+1)
	clusters = append(clusters, mgmtCluster)

	for _, cluster := range clusterList.Items {
		clusterInfo := memberClusterToClusterInfo(c, &cluster)
		clusters = append(clusters, clusterInfo)
	}

	common.Success(c, map[string]interface{}{
		"clusters": clusters,
		"total":    len(clusters),
	})
}

// handleGetClusterDetail retrieves detailed information about a specific cluster
func handleGetClusterDetail(c *gin.Context) {
	clusterName := c.Param("name")

	var clusterInfo ClusterInfo

	if clusterName == "mgmt-cluster" || clusterName == "management" {
		clusterInfo = getManagementClusterInfo()
	} else {
		karmadaClient := client.InClusterKarmadaClient()
		cluster, err := karmadaClient.ClusterV1alpha1().Clusters().Get(context.TODO(), clusterName, metav1.GetOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to get cluster", "clusterName", clusterName)
			common.Fail(c, err)
			return
		}
		clusterInfo = memberClusterToClusterInfo(c, cluster)
	}

	common.Success(c, clusterInfo)
}

// handleInstallController installs the migration controller on a cluster
func handleInstallController(c *gin.Context) {
	var req InstallControllerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind install controller request")
		common.Fail(c, err)
		return
	}

	// Default to v2.0 if version not specified
	if req.Version == "" {
		req.Version = "v2.0"
	}

	// Install controller using deployment script
	err := installMigrationController(req.ClusterName, req.Version)
	if err != nil {
		klog.ErrorS(err, "Failed to install migration controller", "cluster", req.ClusterName)
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Migration controller installation started on cluster %s", req.ClusterName),
	})
}

// handleUninstallController uninstalls the migration controller from a cluster
func handleUninstallController(c *gin.Context) {
	var req UninstallControllerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind uninstall controller request")
		common.Fail(c, err)
		return
	}

	// Uninstall controller using deployment script
	err := uninstallMigrationController(req.ClusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to uninstall migration controller", "cluster", req.ClusterName)
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Migration controller uninstallation started on cluster %s", req.ClusterName),
	})
}

// handleCheckControllerStatus checks the status of migration controller on a cluster
func handleCheckControllerStatus(c *gin.Context) {
	clusterName := c.Param("name")

	status, version, err := checkMigrationControllerStatus(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to check migration controller status", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"clusterName": clusterName,
		"status":      status,
		"version":     version,
		"checkedAt":   time.Now().Format(time.RFC3339),
	})
}

// handleGetControllerLogs retrieves logs from migration controller
func handleGetControllerLogs(c *gin.Context) {
	clusterName := c.Param("name")
	lines := c.DefaultQuery("lines", "100")

	logs, err := getMigrationControllerLogs(clusterName, lines)
	if err != nil {
		klog.ErrorS(err, "Failed to get migration controller logs", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"clusterName": clusterName,
		"logs":        logs,
		"retrievedAt": time.Now().Format(time.RFC3339),
	})
}

// Helper functions

func getManagementClusterInfo() ClusterInfo {
	// Get basic cluster info from Karmada API server
	cluster := ClusterInfo{
		Name:        "mgmt-cluster",
		Type:        "management",
		Status:      "Ready",
		LastChecked: time.Now().Format(time.RFC3339),
	}

	// Check migration controller status on management cluster
	// For management cluster, we don't need gin context, so we can call directly
	status, version, err := checkManagementMigrationController()
	if err != nil {
		cluster.MigrationControllerStatus = "error"
		cluster.Error = err.Error()
	} else {
		cluster.MigrationControllerStatus = status
		cluster.MigrationControllerVersion = version
	}

	return cluster
}

func memberClusterToClusterInfo(ctx *gin.Context, cluster *clusterv1alpha1.Cluster) ClusterInfo {
	clusterInfo := ClusterInfo{
		Name:        cluster.Name,
		Type:        "member",
		Status:      getClusterReadyStatus(cluster),
		LastChecked: time.Now().Format(time.RFC3339),
	}

	// Extract Kubernetes version if available
	if cluster.Status.KubernetesVersion != "" {
		clusterInfo.KubeVersion = cluster.Status.KubernetesVersion
	}

	// Extract node count if available
	if cluster.Status.NodeSummary != nil {
		clusterInfo.NodeCount = int(cluster.Status.NodeSummary.TotalNum)
	}

	// Check migration controller status
	status, version, err := checkMigrationControllerStatus(ctx, cluster.Name)
	if err != nil {
		clusterInfo.MigrationControllerStatus = "error"
		clusterInfo.Error = err.Error()
	} else {
		clusterInfo.MigrationControllerStatus = status
		clusterInfo.MigrationControllerVersion = version
	}

	return clusterInfo
}

func getClusterReadyStatus(cluster *clusterv1alpha1.Cluster) string {
	for _, condition := range cluster.Status.Conditions {
		if condition.Type == clusterv1alpha1.ClusterConditionReady {
			if condition.Status == metav1.ConditionTrue {
				return "Ready"
			}
			return "NotReady"
		}
	}
	return "Unknown"
}

func checkMigrationControllerStatus(ctx *gin.Context, clusterName string) (status, version string, err error) {
	// For management cluster, check local deployments
	if clusterName == "mgmt-cluster" || clusterName == "management" {
		return checkManagementMigrationController()
	}

	// For member clusters, use dynamic client with context
	return checkMemberMigrationController(ctx, clusterName)
}

// extractVersionFromDeployment extracts version from deployment container image
func extractVersionFromDeployment(deployment *appsv1.Deployment, controllerType string) string {
	for _, container := range deployment.Spec.Template.Spec.Containers {
		// Extract version from image name like: docker.io/lehuannhatrang/stateful-migration-operator:migrationBackup_v1.21
		if strings.Contains(container.Image, ":"+controllerType+"_") {
			parts := strings.Split(container.Image, ":"+controllerType+"_")
			if len(parts) > 1 {
				return parts[1]
			}
		}
	}
	return "unknown"
}

// extractVersionFromDaemonSetUnstructured extracts version from DaemonSet container image (unstructured)
func extractVersionFromDaemonSetUnstructured(daemonSet map[string]interface{}, controllerType string) string {
	spec, exists := daemonSet["spec"]
	if !exists {
		return "unknown"
	}

	specMap := spec.(map[string]interface{})
	template, exists := specMap["template"]
	if !exists {
		return "unknown"
	}

	templateMap := template.(map[string]interface{})
	templateSpec, exists := templateMap["spec"]
	if !exists {
		return "unknown"
	}

	templateSpecMap := templateSpec.(map[string]interface{})
	containers, exists := templateSpecMap["containers"]
	if !exists {
		return "unknown"
	}

	containersSlice := containers.([]interface{})
	for _, container := range containersSlice {
		containerMap := container.(map[string]interface{})
		if image, exists := containerMap["image"]; exists {
			imageStr := image.(string)
			// Extract version from image name like: docker.io/lehuannhatrang/stateful-migration-operator:checkpointBackup_v1.21
			if strings.Contains(imageStr, ":"+controllerType+"_") {
				parts := strings.Split(imageStr, ":"+controllerType+"_")
				if len(parts) > 1 {
					return parts[1]
				}
			}
		}
	}
	return "unknown"
}

func checkManagementMigrationController() (status, versionResult string, err error) {
	// For management cluster, check:
	// - migrationBackup controller (Deployment)
	// - migrationRestore controller (Deployment)
	// - statefulMigration CRD

	k8sClient := client.InClusterClient()

	// Check migrationBackup controller deployment
	migrationBackupDeployments, err := k8sClient.AppsV1().Deployments("stateful-migration").List(context.TODO(), metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/name=migration-backup-controller",
	})
	if err != nil {
		return "error", "", fmt.Errorf("failed to check migrationBackup controller: %v", err)
	}

	// Check migrationRestore controller deployment
	migrationRestoreDeployments, err := k8sClient.AppsV1().Deployments("stateful-migration").List(context.TODO(), metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/name=migration-restore-controller",
	})
	if err != nil {
		return "error", "", fmt.Errorf("failed to check migrationRestore controller: %v", err)
	}

	// Check statefulMigration CRD using dynamic client
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		return "error", "", fmt.Errorf("failed to get dynamic client: %v", err)
	}

	// Try to list StatefulMigration resources to verify CRD exists
	statefulMigrationGVR := schema.GroupVersionResource{
		Group:    "migration.dcnlab.com",
		Version:  "v1",
		Resource: "statefulmigrations",
	}

	// Try to list resources - if CRD doesn't exist, this will fail
	_, err = dynamicClient.Resource(statefulMigrationGVR).Namespace(config.GetNamespace()).List(context.TODO(), metav1.ListOptions{Limit: 1})
	if err != nil {
		return "error", "", fmt.Errorf("statefulMigration CRD not found or not accessible: %v", err)
	}

	// Check if all components are present and ready
	var detectedVersion string
	componentsReady := 0
	totalComponents := 2 // migrationBackup + migrationRestore controllers

	// Check migrationBackup controller
	if len(migrationBackupDeployments.Items) > 0 {
		deployment := migrationBackupDeployments.Items[0]
		if deployment.Status.ReadyReplicas > 0 {
			componentsReady++
			if detectedVersion == "" {
				detectedVersion = extractVersionFromDeployment(&deployment, "migrationBackup")
			}
		}
	}

	// Check migrationRestore controller
	if len(migrationRestoreDeployments.Items) > 0 {
		deployment := migrationRestoreDeployments.Items[0]
		if deployment.Status.ReadyReplicas > 0 {
			componentsReady++
			if detectedVersion == "" {
				detectedVersion = extractVersionFromDeployment(&deployment, "migrationRestore")
			}
		}
	}

	// Determine overall status
	if componentsReady == 0 {
		return "not-installed", "", nil
	} else if componentsReady == totalComponents {
		return "installed", detectedVersion, nil
	} else {
		return "partial", detectedVersion, fmt.Errorf("only %d of %d controllers are ready", componentsReady, totalComponents)
	}
}

func checkMemberMigrationController(ctx *gin.Context, clusterName string) (status, versionResult string, err error) {
	// For member cluster, check:
	// - checkpointBackup controller (DaemonSet)
	// - checkpointBackup CRD
	// - checkpointRestore CRD

	karmadaClient := client.InClusterKarmadaClient()

	// Check if the cluster exists and is ready in Karmada
	cluster, err := karmadaClient.ClusterV1alpha1().Clusters().Get(context.TODO(), clusterName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get cluster from Karmada", "cluster", clusterName)
		return "error", "", fmt.Errorf("cluster not found in Karmada: %v", err)
	}

	// Check cluster readiness
	isReady := false
	for _, condition := range cluster.Status.Conditions {
		if condition.Type == clusterv1alpha1.ClusterConditionReady && condition.Status == metav1.ConditionTrue {
			isReady = true
			break
		}
	}

	if !isReady {
		klog.InfoS("Cluster is not ready, migration controller status unknown", "cluster", clusterName)
		return "unknown", "", fmt.Errorf("cluster %s is not ready", clusterName)
	}

	// Create dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMember(ctx, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to create dynamic client for member cluster", "cluster", clusterName)
		return "error", "", fmt.Errorf("failed to create dynamic client for member cluster: %v", err)
	}

	// Check checkpointBackup CRD
	checkpointBackupGVR := schema.GroupVersionResource{
		Group:    "migration.dcnlab.com",
		Version:  "v1",
		Resource: "checkpointbackups",
	}

	_, err = dynamicClient.Resource(checkpointBackupGVR).List(context.TODO(), metav1.ListOptions{Limit: 1})
	if err != nil {
		return "error", "", fmt.Errorf("checkpointBackup CRD not found: %v", err)
	}

	// Check checkpointRestore CRD
	checkpointRestoreGVR := schema.GroupVersionResource{
		Group:    "migration.dcnlab.com",
		Version:  "v1",
		Resource: "checkpointrestores",
	}

	_, err = dynamicClient.Resource(checkpointRestoreGVR).List(context.TODO(), metav1.ListOptions{Limit: 1})
	if err != nil {
		return "error", "", fmt.Errorf("checkpointRestore CRD not found: %v", err)
	}

	// Check checkpointBackup controller DaemonSet
	daemonSetGVR := schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "daemonsets",
	}

	// Look for the cluster-specific DaemonSet name first
	clusterSpecificDaemonSetName := fmt.Sprintf("checkpoint-backup-controller-%s", clusterName)
	daemonSet, err := dynamicClient.Resource(daemonSetGVR).Namespace("stateful-migration").Get(context.TODO(), clusterSpecificDaemonSetName, metav1.GetOptions{})

	// If cluster-specific DaemonSet not found, try the generic name (for manual deployments)
	if err != nil && strings.Contains(err.Error(), "not found") {
		genericDaemonSetName := "checkpoint-backup-controller"
		daemonSet, err = dynamicClient.Resource(daemonSetGVR).Namespace("stateful-migration").Get(context.TODO(), genericDaemonSetName, metav1.GetOptions{})
		if err != nil {
			if strings.Contains(err.Error(), "not found") {
				return "not-installed", "", nil
			}
			klog.ErrorS(err, "Failed to check checkpointBackup controller DaemonSet", "cluster", clusterName)
			return "error", "", fmt.Errorf("failed to check checkpointBackup controller DaemonSet: %v", err)
		}
	} else if err != nil {
		klog.ErrorS(err, "Failed to check checkpointBackup controller DaemonSet", "cluster", clusterName)
		return "error", "", fmt.Errorf("failed to check checkpointBackup controller DaemonSet: %v", err)
	}

	// If we got here, the DaemonSet exists
	// Check DaemonSet status
	status_obj, exists := daemonSet.Object["status"]
	if !exists {
		return "error", "", fmt.Errorf("DaemonSet status not available")
	}

	statusMap := status_obj.(map[string]interface{})

	// Get numberReady from status
	numberReady, exists := statusMap["numberReady"]
	if !exists {
		return "error", "", fmt.Errorf("DaemonSet numberReady not available")
	}

	// Extract version from container image
	detectedVersion := extractVersionFromDaemonSetUnstructured(daemonSet.Object, "checkpointBackup")

	// Check if DaemonSet is ready
	ready := int64(0)
	switch v := numberReady.(type) {
	case int64:
		ready = v
	case float64:
		ready = int64(v)
	default:
		return "error", detectedVersion, fmt.Errorf("unexpected numberReady type: %T", numberReady)
	}

	if ready == 0 {
		return "partial", detectedVersion, fmt.Errorf("DaemonSet not ready")
	}

	return "installed", detectedVersion, nil
}

// fetchYAMLFromURL fetches YAML content from a URL
func fetchYAMLFromURL(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch YAML from %s: %v", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch YAML: HTTP %d", resp.StatusCode)
	}

	content, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read YAML content: %v", err)
	}

	return content, nil
}

// applyYAMLManifest applies a YAML manifest using the appropriate client
func getKarmadaDynamicClient() (dynamic.Interface, error) {
	// Use the same config that InClusterKarmadaClient() uses
	karmadaConfig, _, err := client.GetKarmadaConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get Karmada config: %v", err)
	}

	karmadaDynamicClient, err := dynamic.NewForConfig(karmadaConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create Karmada dynamic client: %v", err)
	}

	return karmadaDynamicClient, nil
}

func applyYAMLManifestToKarmadaWithCluster(yamlContent []byte, namespace, clusterName string) error {
	// Decode YAML into unstructured objects
	decoder := yaml.NewYAMLOrJSONDecoder(strings.NewReader(string(yamlContent)), 4096)

	// Get Karmada dynamic client
	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		return err
	}

	for {
		var rawObj map[string]interface{}
		err := decoder.Decode(&rawObj)
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to decode YAML: %v", err)
		}

		if rawObj == nil {
			continue
		}

		obj := &unstructured.Unstructured{Object: rawObj}

		// Set namespace if not specified and resource is namespaced
		if obj.GetNamespace() == "" && namespace != "" {
			// Check if this is a namespaced resource
			gvk := obj.GroupVersionKind()
			if gvk.Kind != "ClusterRole" && gvk.Kind != "ClusterRoleBinding" {
				obj.SetNamespace(namespace)
			}
		}

		// Make resource names cluster-specific if clusterName is provided
		if clusterName != "" {
			originalName := obj.GetName()
			gvk := obj.GroupVersionKind()

			switch gvk.Kind {
			case "ServiceAccount":
				if originalName == "checkpoint-backup-sa" {
					newName := fmt.Sprintf("checkpoint-backup-sa-%s", clusterName)
					obj.SetName(newName)
				}
			case "ClusterRole":
				if originalName == "checkpoint-backup-role" {
					newName := fmt.Sprintf("checkpoint-backup-role-%s", clusterName)
					obj.SetName(newName)
				}
			case "ClusterRoleBinding":
				if originalName == "checkpoint-backup-rolebinding" {
					newName := fmt.Sprintf("checkpoint-backup-rolebinding-%s", clusterName)
					obj.SetName(newName)

					// Update the roleRef to point to the cluster-specific ClusterRole
					roleRef, found, err := unstructured.NestedMap(obj.Object, "roleRef")
					if err == nil && found {
						if roleName, exists := roleRef["name"]; exists && roleName == "checkpoint-backup-role" {
							roleRef["name"] = fmt.Sprintf("checkpoint-backup-role-%s", clusterName)
							err = unstructured.SetNestedMap(obj.Object, roleRef, "roleRef")
							if err != nil {
								return fmt.Errorf("failed to update roleRef: %v", err)
							}
						}
					}

					// Update the subjects to point to the cluster-specific ServiceAccount
					subjects, found, err := unstructured.NestedSlice(obj.Object, "subjects")
					if err == nil && found {
						for i, subject := range subjects {
							subjectMap := subject.(map[string]interface{})
							if name, exists := subjectMap["name"]; exists && name == "checkpoint-backup-sa" {
								subjectMap["name"] = fmt.Sprintf("checkpoint-backup-sa-%s", clusterName)
								subjects[i] = subjectMap
							}
						}
						err = unstructured.SetNestedSlice(obj.Object, subjects, "subjects")
						if err != nil {
							return fmt.Errorf("failed to update subjects: %v", err)
						}
					}
				}
			}
		}

		// Use Karmada dynamic client to create resources
		gvr, err := getGVRFromGVK(obj.GroupVersionKind())
		if err != nil {
			return fmt.Errorf("failed to get GVR for %s: %v", obj.GroupVersionKind(), err)
		}

		var resourceClient dynamic.ResourceInterface
		if obj.GetNamespace() != "" {
			resourceClient = karmadaDynamicClient.Resource(gvr).Namespace(obj.GetNamespace())
		} else {
			resourceClient = karmadaDynamicClient.Resource(gvr)
		}

		_, err = resourceClient.Create(context.TODO(), obj, metav1.CreateOptions{})
		if err != nil && !strings.Contains(err.Error(), "already exists") {
			return fmt.Errorf("failed to create %s %s in Karmada: %v", obj.GetKind(), obj.GetName(), err)
		}
	}

	return nil
}

func getGVRFromGVK(gvk schema.GroupVersionKind) (schema.GroupVersionResource, error) {
	// Map common resources
	resourceMap := map[schema.GroupVersionKind]schema.GroupVersionResource{
		{Group: "", Version: "v1", Kind: "ServiceAccount"}:                              {Group: "", Version: "v1", Resource: "serviceaccounts"},
		{Group: "apps", Version: "v1", Kind: "DaemonSet"}:                               {Group: "apps", Version: "v1", Resource: "daemonsets"},
		{Group: "rbac.authorization.k8s.io", Version: "v1", Kind: "ClusterRole"}:        {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"},
		{Group: "rbac.authorization.k8s.io", Version: "v1", Kind: "ClusterRoleBinding"}: {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"},
	}

	if gvr, exists := resourceMap[gvk]; exists {
		return gvr, nil
	}

	// For unknown resources, use a simple pluralization
	resource := strings.ToLower(gvk.Kind) + "s"
	return schema.GroupVersionResource{
		Group:    gvk.Group,
		Version:  gvk.Version,
		Resource: resource,
	}, nil
}

func applyModifiedDaemonSetToKarmada(yamlContent []byte, clusterName, version string) error {
	// Parse the YAML to modify the DaemonSet name and image
	decoder := yaml.NewYAMLOrJSONDecoder(strings.NewReader(string(yamlContent)), 4096)

	// Get Karmada dynamic client
	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		return err
	}

	for {
		var rawObj map[string]interface{}
		err := decoder.Decode(&rawObj)
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to decode YAML: %v", err)
		}

		if rawObj == nil {
			continue
		}

		obj := &unstructured.Unstructured{Object: rawObj}

		// Only process DaemonSet objects
		if obj.GetKind() == "DaemonSet" {
			// Set namespace if not specified
			if obj.GetNamespace() == "" {
				obj.SetNamespace("stateful-migration")
			}

			// Modify DaemonSet name to be cluster-specific
			originalName := obj.GetName()
			newName := fmt.Sprintf("%s-%s", originalName, clusterName)
			obj.SetName(newName)

			// Update container image - replace $image_name placeholder
			containers, found, err := unstructured.NestedSlice(obj.Object, "spec", "template", "spec", "containers")
			if err != nil {
				return fmt.Errorf("failed to get containers: %v", err)
			}
			if found {
				for i, container := range containers {
					containerMap := container.(map[string]interface{})
					if name, exists := containerMap["name"]; exists && name == "controller" {
						// Replace $image_name placeholder with actual image
						containerMap["image"] = fmt.Sprintf("docker.io/lehuannhatrang/stateful-migration-operator:checkpointBackup_%s", version)
						containers[i] = containerMap
						break
					}
				}
				err = unstructured.SetNestedSlice(obj.Object, containers, "spec", "template", "spec", "containers")
				if err != nil {
					return fmt.Errorf("failed to set containers: %v", err)
				}
			}

			// Update serviceAccountName to be cluster-specific
			serviceAccountName, found, err := unstructured.NestedString(obj.Object, "spec", "template", "spec", "serviceAccountName")
			if err != nil {
				return fmt.Errorf("failed to get serviceAccountName: %v", err)
			}
			if found && serviceAccountName == "checkpoint-backup-sa" {
				newServiceAccountName := fmt.Sprintf("checkpoint-backup-sa-%s", clusterName)
				err = unstructured.SetNestedField(obj.Object, newServiceAccountName, "spec", "template", "spec", "serviceAccountName")
				if err != nil {
					return fmt.Errorf("failed to set serviceAccountName: %v", err)
				}
				klog.InfoS("Updated DaemonSet serviceAccountName", "original", serviceAccountName, "new", newServiceAccountName, "cluster", clusterName)
			} else if found {
				klog.InfoS("ServiceAccountName found but not matching expected", "serviceAccountName", serviceAccountName, "expected", "checkpoint-backup-sa", "cluster", clusterName)
			} else {
				klog.InfoS("ServiceAccountName not found in DaemonSet", "cluster", clusterName)
			}

			// Create the DaemonSet in Karmada
			daemonSetGVR := schema.GroupVersionResource{
				Group:    "apps",
				Version:  "v1",
				Resource: "daemonsets",
			}

			_, err = karmadaDynamicClient.Resource(daemonSetGVR).Namespace(obj.GetNamespace()).Create(context.TODO(), obj, metav1.CreateOptions{})
			if err != nil && !strings.Contains(err.Error(), "already exists") {
				return fmt.Errorf("failed to create DaemonSet %s in Karmada: %v", newName, err)
			}
		}
	}

	return nil
}

func applyYAMLManifest(yamlContent []byte, namespace string) error {
	// Decode YAML into unstructured objects
	decoder := yaml.NewYAMLOrJSONDecoder(strings.NewReader(string(yamlContent)), 4096)

	for {
		var rawObj map[string]interface{}
		err := decoder.Decode(&rawObj)
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to decode YAML: %v", err)
		}

		if rawObj == nil {
			continue
		}

		obj := &unstructured.Unstructured{Object: rawObj}

		// Determine the client type based on the resource
		gvk := obj.GroupVersionKind()

		if gvk.Group == "" && gvk.Version == "v1" {
			// Core resources (Namespace, ServiceAccount, etc.)
			k8sClient := client.InClusterClient()

			switch gvk.Kind {
			case "Namespace":
				ns := &corev1.Namespace{}
				err = convertUnstructuredToTyped(obj, ns)
				if err != nil {
					return fmt.Errorf("failed to convert namespace: %v", err)
				}
				_, err = k8sClient.CoreV1().Namespaces().Create(context.TODO(), ns, metav1.CreateOptions{})
				if err != nil && !strings.Contains(err.Error(), "already exists") {
					return fmt.Errorf("failed to create namespace: %v", err)
				}
			case "ServiceAccount":
				sa := &corev1.ServiceAccount{}
				err = convertUnstructuredToTyped(obj, sa)
				if err != nil {
					return fmt.Errorf("failed to convert service account: %v", err)
				}
				if namespace != "" {
					sa.Namespace = namespace
				}
				_, err = k8sClient.CoreV1().ServiceAccounts(sa.Namespace).Create(context.TODO(), sa, metav1.CreateOptions{})
				if err != nil && !strings.Contains(err.Error(), "already exists") {
					return fmt.Errorf("failed to create service account: %v", err)
				}
			}
		} else if gvk.Group == "apps" && gvk.Version == "v1" {
			// Apps resources (Deployment, DaemonSet)
			k8sClient := client.InClusterClient()

			switch gvk.Kind {
			case "Deployment":
				deployment := &appsv1.Deployment{}
				err = convertUnstructuredToTyped(obj, deployment)
				if err != nil {
					return fmt.Errorf("failed to convert deployment: %v", err)
				}
				if namespace != "" {
					deployment.Namespace = namespace
				}
				_, err = k8sClient.AppsV1().Deployments(deployment.Namespace).Create(context.TODO(), deployment, metav1.CreateOptions{})
				if err != nil && !strings.Contains(err.Error(), "already exists") {
					return fmt.Errorf("failed to create deployment: %v", err)
				}
			case "DaemonSet":
				daemonset := &appsv1.DaemonSet{}
				err = convertUnstructuredToTyped(obj, daemonset)
				if err != nil {
					return fmt.Errorf("failed to convert daemonset: %v", err)
				}
				if namespace != "" {
					daemonset.Namespace = namespace
				}
				_, err = k8sClient.AppsV1().DaemonSets(daemonset.Namespace).Create(context.TODO(), daemonset, metav1.CreateOptions{})
				if err != nil && !strings.Contains(err.Error(), "already exists") {
					return fmt.Errorf("failed to create daemonset: %v", err)
				}
			}
		} else if gvk.Group == "rbac.authorization.k8s.io" && gvk.Version == "v1" {
			// RBAC resources
			k8sClient := client.InClusterClient()

			switch gvk.Kind {
			case "ClusterRole":
				clusterRole := &rbacv1.ClusterRole{}
				err = convertUnstructuredToTyped(obj, clusterRole)
				if err != nil {
					return fmt.Errorf("failed to convert cluster role: %v", err)
				}
				_, err = k8sClient.RbacV1().ClusterRoles().Create(context.TODO(), clusterRole, metav1.CreateOptions{})
				if err != nil && !strings.Contains(err.Error(), "already exists") {
					return fmt.Errorf("failed to create cluster role: %v", err)
				}
			case "ClusterRoleBinding":
				clusterRoleBinding := &rbacv1.ClusterRoleBinding{}
				err = convertUnstructuredToTyped(obj, clusterRoleBinding)
				if err != nil {
					return fmt.Errorf("failed to convert cluster role binding: %v", err)
				}
				_, err = k8sClient.RbacV1().ClusterRoleBindings().Create(context.TODO(), clusterRoleBinding, metav1.CreateOptions{})
				if err != nil && !strings.Contains(err.Error(), "already exists") {
					return fmt.Errorf("failed to create cluster role binding: %v", err)
				}
			case "Role":
				role := &rbacv1.Role{}
				err = convertUnstructuredToTyped(obj, role)
				if err != nil {
					return fmt.Errorf("failed to convert role: %v", err)
				}
				if namespace != "" {
					role.Namespace = namespace
				}
				_, err = k8sClient.RbacV1().Roles(role.Namespace).Create(context.TODO(), role, metav1.CreateOptions{})
				if err != nil && !strings.Contains(err.Error(), "already exists") {
					return fmt.Errorf("failed to create role: %v", err)
				}
			case "RoleBinding":
				roleBinding := &rbacv1.RoleBinding{}
				err = convertUnstructuredToTyped(obj, roleBinding)
				if err != nil {
					return fmt.Errorf("failed to convert role binding: %v", err)
				}
				if namespace != "" {
					roleBinding.Namespace = namespace
				}
				_, err = k8sClient.RbacV1().RoleBindings(roleBinding.Namespace).Create(context.TODO(), roleBinding, metav1.CreateOptions{})
				if err != nil && !strings.Contains(err.Error(), "already exists") {
					return fmt.Errorf("failed to create role binding: %v", err)
				}
			}
		} else if gvk.Group == "apiextensions.k8s.io" && gvk.Version == "v1" && gvk.Kind == "CustomResourceDefinition" {
			// CRD resources - use dynamic client
			dynamicClient, err := client.GetDynamicClient()
			if err != nil {
				return fmt.Errorf("failed to get dynamic client: %v", err)
			}

			crdGVR := schema.GroupVersionResource{
				Group:    "apiextensions.k8s.io",
				Version:  "v1",
				Resource: "customresourcedefinitions",
			}

			_, err = dynamicClient.Resource(crdGVR).Create(context.TODO(), obj, metav1.CreateOptions{})
			if err != nil && !strings.Contains(err.Error(), "already exists") {
				return fmt.Errorf("failed to create CRD: %v", err)
			}
		} else if gvk.Group == "policy.karmada.io" {
			// Karmada policy resources
			dynamicClient, err := client.GetDynamicClient()
			if err != nil {
				return fmt.Errorf("failed to get dynamic client: %v", err)
			}

			gvr := schema.GroupVersionResource{
				Group:    gvk.Group,
				Version:  gvk.Version,
				Resource: strings.ToLower(gvk.Kind) + "s",
			}

			if namespace != "" {
				obj.SetNamespace(namespace)
			}

			_, err = dynamicClient.Resource(gvr).Namespace(obj.GetNamespace()).Create(context.TODO(), obj, metav1.CreateOptions{})
			if err != nil && !strings.Contains(err.Error(), "already exists") {
				return fmt.Errorf("failed to create %s: %v", gvk.Kind, err)
			}
		} else {
			// Use dynamic client for other resources
			dynamicClient, err := client.GetDynamicClient()
			if err != nil {
				return fmt.Errorf("failed to get dynamic client: %v", err)
			}

			gvr := schema.GroupVersionResource{
				Group:    gvk.Group,
				Version:  gvk.Version,
				Resource: strings.ToLower(gvk.Kind) + "s",
			}

			if namespace != "" {
				obj.SetNamespace(namespace)
			}

			_, err = dynamicClient.Resource(gvr).Namespace(obj.GetNamespace()).Create(context.TODO(), obj, metav1.CreateOptions{})
			if err != nil && !strings.Contains(err.Error(), "already exists") {
				return fmt.Errorf("failed to create %s: %v", gvk.Kind, err)
			}
		}
	}

	return nil
}

// convertUnstructuredToTyped converts an unstructured object to a typed object
func convertUnstructuredToTyped(obj *unstructured.Unstructured, target interface{}) error {
	return runtime.DefaultUnstructuredConverter.FromUnstructured(obj.Object, target)
}

func installMigrationController(clusterName, version string) error {
	// Install migration controller using Kubernetes Go API
	// This is based on the deploy.sh script from the stateful-migration-operator repository

	k8sClient := client.InClusterClient()

	// Create namespace if it doesn't exist
	namespace := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: "stateful-migration",
		},
	}
	_, err := k8sClient.CoreV1().Namespaces().Create(context.TODO(), namespace, metav1.CreateOptions{})
	if err != nil && !strings.Contains(err.Error(), "already exists") {
		return fmt.Errorf("failed to create namespace: %v", err)
	}

	if clusterName == "mgmt-cluster" || clusterName == "management" {
		// Install MigrationBackup controller on management cluster

		// 1. Apply StatefulMigration CRD
		crdYAML, err := fetchYAMLFromURL("https://raw.githubusercontent.com/lehuannhatrang/stateful-migration-operator/main/config/crd/bases/migration.dcnlab.com_statefulmigrations.yaml")
		if err != nil {
			return fmt.Errorf("failed to fetch StatefulMigration CRD: %v", err)
		}
		err = applyYAMLManifest(crdYAML, "")
		if err != nil {
			return fmt.Errorf("failed to apply StatefulMigration CRD: %v", err)
		}

		// 2. Apply RBAC
		rbacYAML, err := fetchYAMLFromURL("https://raw.githubusercontent.com/lehuannhatrang/stateful-migration-operator/main/config/rbac/migration_backup_rbac.yaml")
		if err != nil {
			return fmt.Errorf("failed to fetch migration backup RBAC: %v", err)
		}
		err = applyYAMLManifest(rbacYAML, "stateful-migration")
		if err != nil {
			return fmt.Errorf("failed to apply migration backup RBAC: %v", err)
		}

		// 3. Apply deployment
		deploymentYAML, err := fetchYAMLFromURL("https://raw.githubusercontent.com/lehuannhatrang/stateful-migration-operator/main/deploy/migration-backup-controller.yaml")
		if err != nil {
			return fmt.Errorf("failed to fetch migration backup deployment: %v", err)
		}
		err = applyYAMLManifest(deploymentYAML, "stateful-migration")
		if err != nil {
			return fmt.Errorf("failed to apply migration backup deployment: %v", err)
		}

		// 4. Update image version
		deployment, err := k8sClient.AppsV1().Deployments("stateful-migration").Get(context.TODO(), "migration-backup-controller", metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("failed to get migration backup deployment: %v", err)
		}

		// Update container image
		for i := range deployment.Spec.Template.Spec.Containers {
			if deployment.Spec.Template.Spec.Containers[i].Name == "manager" {
				deployment.Spec.Template.Spec.Containers[i].Image = fmt.Sprintf("docker.io/lehuannhatrang/stateful-migration-operator:migrationBackup_%s", version)
				break
			}
		}

		_, err = k8sClient.AppsV1().Deployments("stateful-migration").Update(context.TODO(), deployment, metav1.UpdateOptions{})
		if err != nil {
			return fmt.Errorf("failed to update migration backup deployment image: %v", err)
		}

	} else {
		// Install CheckpointBackup controller on member cluster using Karmada propagation

		// 1. Apply checkpoint backup RBAC to Karmada with cluster-specific names
		rbacYAML, err := fetchYAMLFromURL("https://raw.githubusercontent.com/lehuannhatrang/stateful-migration-operator/main/config/rbac/checkpoint_backup_rbac.yaml")
		if err != nil {
			return fmt.Errorf("failed to fetch checkpoint backup RBAC: %v", err)
		}
		err = applyYAMLManifestToKarmadaWithCluster(rbacYAML, "stateful-migration", clusterName)
		if err != nil {
			return fmt.Errorf("failed to apply checkpoint backup RBAC to Karmada: %v", err)
		}

		// 2. Fetch checkpoint backup DaemonSet YAML and modify it for cluster-specific naming
		daemonsetYAML, err := fetchYAMLFromURL("https://raw.githubusercontent.com/lehuannhatrang/stateful-migration-operator/main/deploy/checkpoint-backup-daemonset.yaml")
		if err != nil {
			return fmt.Errorf("failed to fetch checkpoint backup DaemonSet: %v", err)
		}

		// 3. Parse and modify the DaemonSet YAML to be cluster-specific
		err = applyModifiedDaemonSetToKarmada(daemonsetYAML, clusterName, version)
		if err != nil {
			return fmt.Errorf("failed to apply checkpoint backup DaemonSet to Karmada: %v", err)
		}

		// 4. Create PropagationPolicy for namespaced resources (DaemonSet, ServiceAccount)
		clusterSpecificDaemonSetName := fmt.Sprintf("checkpoint-backup-controller-%s", clusterName)
		clusterSpecificServiceAccountName := fmt.Sprintf("checkpoint-backup-sa-%s", clusterName)
		propagationPolicy := &policyv1alpha1.PropagationPolicy{
			ObjectMeta: metav1.ObjectMeta{
				Name:      fmt.Sprintf("checkpoint-backup-%s", clusterName),
				Namespace: "stateful-migration",
			},
			Spec: policyv1alpha1.PropagationSpec{
				ResourceSelectors: []policyv1alpha1.ResourceSelector{
					{
						APIVersion: "apps/v1",
						Kind:       "DaemonSet",
						Name:       clusterSpecificDaemonSetName,
					},
					{
						APIVersion: "v1",
						Kind:       "ServiceAccount",
						Name:       clusterSpecificServiceAccountName,
					},
				},
				Placement: policyv1alpha1.Placement{
					ClusterAffinity: &policyv1alpha1.ClusterAffinity{
						ClusterNames: []string{clusterName},
					},
				},
			},
		}

		// 5. Create ClusterPropagationPolicy for cluster-scoped resources (ClusterRole, ClusterRoleBinding)
		clusterPropagationPolicy := &policyv1alpha1.ClusterPropagationPolicy{
			ObjectMeta: metav1.ObjectMeta{
				Name: fmt.Sprintf("checkpoint-backup-cluster-rbac-%s", clusterName),
			},
			Spec: policyv1alpha1.PropagationSpec{
				ResourceSelectors: []policyv1alpha1.ResourceSelector{
					{
						APIVersion: "rbac.authorization.k8s.io/v1",
						Kind:       "ClusterRole",
						Name:       "checkpoint-backup-role",
					},
					{
						APIVersion: "rbac.authorization.k8s.io/v1",
						Kind:       "ClusterRoleBinding",
						Name:       "checkpoint-backup-rolebinding",
					},
				},
				Placement: policyv1alpha1.Placement{
					ClusterAffinity: &policyv1alpha1.ClusterAffinity{
						ClusterNames: []string{clusterName},
					},
				},
			},
		}

		karmadaClient := client.InClusterKarmadaClient()

		// Create PropagationPolicy for namespaced resources
		_, err = karmadaClient.PolicyV1alpha1().PropagationPolicies("stateful-migration").Create(context.TODO(), propagationPolicy, metav1.CreateOptions{})
		if err != nil && !strings.Contains(err.Error(), "already exists") {
			return fmt.Errorf("failed to create propagation policy: %v", err)
		}

		// Create ClusterPropagationPolicy for cluster-scoped resources
		_, err = karmadaClient.PolicyV1alpha1().ClusterPropagationPolicies().Create(context.TODO(), clusterPropagationPolicy, metav1.CreateOptions{})
		if err != nil && !strings.Contains(err.Error(), "already exists") {
			return fmt.Errorf("failed to create cluster propagation policy: %v", err)
		}
	}

	klog.InfoS("Migration controller installation completed", "cluster", clusterName)
	return nil
}

func uninstallMigrationController(clusterName string) error {
	// Uninstall migration controller using Kubernetes Go API

	k8sClient := client.InClusterClient()

	if clusterName == "mgmt-cluster" || clusterName == "management" {
		// Uninstall MigrationBackup controller from management cluster

		// Delete deployment
		err := k8sClient.AppsV1().Deployments("stateful-migration").Delete(context.TODO(), "migration-backup-controller", metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete migration-backup-controller deployment")
		}

		// Delete RBAC resources
		err = k8sClient.RbacV1().ClusterRoles().Delete(context.TODO(), "migration-backup-controller-role", metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete migration-backup-controller-role ClusterRole")
		}

		err = k8sClient.RbacV1().ClusterRoleBindings().Delete(context.TODO(), "migration-backup-controller-rolebinding", metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete migration-backup-controller-rolebinding ClusterRoleBinding")
		}

		err = k8sClient.RbacV1().Roles("stateful-migration").Delete(context.TODO(), "migration-backup-leader-election-role", metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete migration-backup-leader-election-role Role")
		}

		err = k8sClient.RbacV1().RoleBindings("stateful-migration").Delete(context.TODO(), "migration-backup-leader-election-rolebinding", metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete migration-backup-leader-election-rolebinding RoleBinding")
		}

		err = k8sClient.CoreV1().ServiceAccounts("stateful-migration").Delete(context.TODO(), "migration-backup-controller", metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete migration-backup-controller ServiceAccount")
		}

		// Delete StatefulMigration CRD (optional, as it might be used by other components)
		dynamicClient, err := client.GetDynamicClient()
		if err == nil {
			crdGVR := schema.GroupVersionResource{
				Group:    "apiextensions.k8s.io",
				Version:  "v1",
				Resource: "customresourcedefinitions",
			}
			err = dynamicClient.Resource(crdGVR).Delete(context.TODO(), "statefulmigrations.migration.dcnlab.com", metav1.DeleteOptions{})
		}
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete StatefulMigration CRD")
		}

		// Delete namespace if empty (check if there are resources left)
		pods, err := k8sClient.CoreV1().Pods("stateful-migration").List(context.TODO(), metav1.ListOptions{})
		if err == nil && len(pods.Items) == 0 {
			// Check other resources
			deployments, _ := k8sClient.AppsV1().Deployments("stateful-migration").List(context.TODO(), metav1.ListOptions{})
			daemonsets, _ := k8sClient.AppsV1().DaemonSets("stateful-migration").List(context.TODO(), metav1.ListOptions{})

			if len(deployments.Items) == 0 && len(daemonsets.Items) == 0 {
				err = k8sClient.CoreV1().Namespaces().Delete(context.TODO(), "stateful-migration", metav1.DeleteOptions{})
				if err != nil && !strings.Contains(err.Error(), "not found") {
					klog.ErrorS(err, "Failed to delete stateful-migration namespace")
				}
			}
		}

	} else {
		// Uninstall CheckpointBackup controller from member cluster

		karmadaClient := client.InClusterKarmadaClient()

		// Delete PropagationPolicy
		err := karmadaClient.PolicyV1alpha1().PropagationPolicies("stateful-migration").Delete(context.TODO(), fmt.Sprintf("checkpoint-backup-%s", clusterName), metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete checkpoint-backup PropagationPolicy", "cluster", clusterName)
		}

		// Delete cluster-wide RBAC (ClusterPropagationPolicy)
		err = karmadaClient.PolicyV1alpha1().ClusterPropagationPolicies().Delete(context.TODO(), fmt.Sprintf("checkpoint-backup-cluster-rbac-%s", clusterName), metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete checkpoint-backup-cluster-rbac ClusterPropagationPolicy", "cluster", clusterName)
		}

		// Also delete the DaemonSet and RBAC resources from Karmada (they will be removed from member cluster through propagation)
		karmadaDynamicClient, err := getKarmadaDynamicClient()
		if err != nil {
			klog.ErrorS(err, "Failed to get Karmada dynamic client for deletion")
			return nil // Don't fail the uninstall process for this
		}

		// Delete DaemonSet from Karmada (try both cluster-specific and generic names)
		daemonSetGVR := schema.GroupVersionResource{
			Group:    "apps",
			Version:  "v1",
			Resource: "daemonsets",
		}

		// Try cluster-specific name first
		clusterSpecificDaemonSetName := fmt.Sprintf("checkpoint-backup-controller-%s", clusterName)
		err = karmadaDynamicClient.Resource(daemonSetGVR).Namespace("stateful-migration").Delete(context.TODO(), clusterSpecificDaemonSetName, metav1.DeleteOptions{})
		if err != nil && strings.Contains(err.Error(), "not found") {
			// If cluster-specific not found, try generic name (for manual deployments)
			genericDaemonSetName := "checkpoint-backup-controller"
			err = karmadaDynamicClient.Resource(daemonSetGVR).Namespace("stateful-migration").Delete(context.TODO(), genericDaemonSetName, metav1.DeleteOptions{})
			if err != nil && !strings.Contains(err.Error(), "not found") {
				klog.ErrorS(err, "Failed to delete checkpoint-backup-controller DaemonSet from Karmada", "cluster", clusterName)
			}
		} else if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete checkpoint-backup-controller DaemonSet from Karmada", "cluster", clusterName)
		}

		// Delete RBAC resources from Karmada (cluster-specific names)
		clusterSpecificClusterRoleName := fmt.Sprintf("checkpoint-backup-role-%s", clusterName)
		clusterSpecificClusterRoleBindingName := fmt.Sprintf("checkpoint-backup-rolebinding-%s", clusterName)
		clusterSpecificServiceAccountName := fmt.Sprintf("checkpoint-backup-sa-%s", clusterName)

		clusterRoleGVR := schema.GroupVersionResource{
			Group:    "rbac.authorization.k8s.io",
			Version:  "v1",
			Resource: "clusterroles",
		}
		err = karmadaDynamicClient.Resource(clusterRoleGVR).Delete(context.TODO(), clusterSpecificClusterRoleName, metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete cluster-specific ClusterRole from Karmada", "cluster", clusterName)
		}

		clusterRoleBindingGVR := schema.GroupVersionResource{
			Group:    "rbac.authorization.k8s.io",
			Version:  "v1",
			Resource: "clusterrolebindings",
		}
		err = karmadaDynamicClient.Resource(clusterRoleBindingGVR).Delete(context.TODO(), clusterSpecificClusterRoleBindingName, metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete cluster-specific ClusterRoleBinding from Karmada", "cluster", clusterName)
		}

		serviceAccountGVR := schema.GroupVersionResource{
			Group:    "",
			Version:  "v1",
			Resource: "serviceaccounts",
		}
		err = karmadaDynamicClient.Resource(serviceAccountGVR).Namespace("stateful-migration").Delete(context.TODO(), clusterSpecificServiceAccountName, metav1.DeleteOptions{})
		if err != nil && !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to delete cluster-specific ServiceAccount from Karmada", "cluster", clusterName)
		}
	}

	klog.InfoS("Migration controller uninstallation completed", "cluster", clusterName)
	return nil
}

func getMigrationControllerLogs(clusterName, lines string) ([]string, error) {
	k8sClient := client.InClusterClient()

	if clusterName == "mgmt-cluster" || clusterName == "management" {
		// Get logs from management cluster

		// First, find the pod(s) for the migration-backup-controller
		pods, err := k8sClient.CoreV1().Pods("stateful-migration").List(context.TODO(), metav1.ListOptions{
			LabelSelector: "app.kubernetes.io/name=migration-backup-controller",
		})
		if err != nil {
			return nil, fmt.Errorf("failed to list migration backup controller pods: %v", err)
		}

		if len(pods.Items) == 0 {
			return []string{"No migration backup controller pods found"}, nil
		}

		// Get logs from the first pod
		pod := pods.Items[0]

		// Parse lines parameter
		var tailLines *int64
		if lines != "" {
			if linesInt, err := strconv.ParseInt(lines, 10, 64); err == nil && linesInt > 0 {
				tailLines = &linesInt
			}
		}

		logOptions := &corev1.PodLogOptions{}
		if tailLines != nil {
			logOptions.TailLines = tailLines
		}

		req := k8sClient.CoreV1().Pods("stateful-migration").GetLogs(pod.Name, logOptions)
		logs, err := req.Stream(context.TODO())
		if err != nil {
			return nil, fmt.Errorf("failed to get logs for pod %s: %v", pod.Name, err)
		}
		defer logs.Close()

		logContent, err := io.ReadAll(logs)
		if err != nil {
			return nil, fmt.Errorf("failed to read log content: %v", err)
		}

		logLines := strings.Split(strings.TrimSpace(string(logContent)), "\n")
		return logLines, nil

	} else {
		// Get logs from member cluster (this would require member cluster access)
		// For now, return a placeholder
		return []string{"Member cluster log access not implemented yet"}, nil
	}
}

// Register settings routes
func init() {
	r := router.V1()

	// Settings/cluster management routes
	settingsGroup := r.Group("/backup/settings")
	{
		settingsGroup.GET("/clusters", handleGetClusters)
		settingsGroup.GET("/clusters/:name", handleGetClusterDetail)
		settingsGroup.POST("/clusters/install-controller", handleInstallController)
		settingsGroup.POST("/clusters/uninstall-controller", handleUninstallController)
		settingsGroup.GET("/clusters/:name/controller-status", handleCheckControllerStatus)
		settingsGroup.GET("/clusters/:name/controller-logs", handleGetControllerLogs)
	}
}
