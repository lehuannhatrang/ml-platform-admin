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
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
)

// BackupConfiguration represents a backup configuration
type BackupConfiguration struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Cluster      string         `json:"cluster"`
	ResourceType string         `json:"resourceType"` // "pod" or "statefulset"
	ResourceName string         `json:"resourceName"`
	Namespace    string         `json:"namespace"`
	Registry     RegistryInfo   `json:"registry"`
	Repository   string         `json:"repository"`
	Schedule     ScheduleConfig `json:"schedule"`
	Status       string         `json:"status"`
	LastBackup   string         `json:"lastBackup,omitempty"`
	NextBackup   string         `json:"nextBackup,omitempty"`
	CreatedAt    string         `json:"createdAt"`
	UpdatedAt    string         `json:"updatedAt"`
}

// RegistryInfo represents registry information for backup
type RegistryInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Registry string `json:"registry"`
}

// ScheduleConfig represents backup scheduling configuration
type ScheduleConfig struct {
	Type    string `json:"type"`  // "selection" or "cron"
	Value   string `json:"value"` // For selection: "5m", "15m", "30m", "1h". For cron: cron expression
	Enabled bool   `json:"enabled"`
}

// CreateBackupRequest represents the request to create a new backup
type CreateBackupRequest struct {
	Name         string         `json:"name" binding:"required"`
	Cluster      string         `json:"cluster" binding:"required"`
	ResourceType string         `json:"resourceType" binding:"required,oneof=pod statefulset"`
	ResourceName string         `json:"resourceName" binding:"required"`
	Namespace    string         `json:"namespace" binding:"required"`
	RegistryID   string         `json:"registryId" binding:"required"`
	Repository   string         `json:"repository" binding:"required"`
	Schedule     ScheduleConfig `json:"schedule" binding:"required"`
}

// UpdateBackupRequest represents the request to update a backup
type UpdateBackupRequest struct {
	Name         string         `json:"name"`
	Cluster      string         `json:"cluster"`
	ResourceType string         `json:"resourceType"`
	ResourceName string         `json:"resourceName"`
	Namespace    string         `json:"namespace"`
	RegistryID   string         `json:"registryId"`
	Repository   string         `json:"repository"`
	Schedule     ScheduleConfig `json:"schedule"`
}

// BackupExecutionRequest represents a request to execute a backup immediately
type BackupExecutionRequest struct {
	BackupID string `json:"backupId" binding:"required"`
}

// StatefulMigrationCR represents the StatefulMigration custom resource
var statefulMigrationGVR = schema.GroupVersionResource{
	Group:    "migration.dcnlab.com",
	Version:  "v1",
	Resource: "statefulmigrations",
}

var defaultNamespace = "stateful-migration"

// handleGetBackups retrieves all backup configurations
func handleGetBackups(c *gin.Context) {
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// List all StatefulMigration CRs
	unstructuredList, err := dynamicClient.Resource(statefulMigrationGVR).List(context.TODO(), metav1.ListOptions{
		LabelSelector: "app=backup-migration",
	})
	if err != nil {
		klog.ErrorS(err, "Failed to list StatefulMigration CRs")
		common.Fail(c, err)
		return
	}

	backups := make([]BackupConfiguration, 0, len(unstructuredList.Items))
	for _, item := range unstructuredList.Items {
		backup := statefulMigrationToBackup(&item)
		backups = append(backups, backup)
	}

	common.Success(c, map[string]interface{}{
		"backups": backups,
		"total":   len(backups),
	})
}

// handleGetBackup retrieves a specific backup configuration
func handleGetBackup(c *gin.Context) {
	backupID := c.Param("id")
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the StatefulMigration CR
	unstructuredObj, err := dynamicClient.Resource(statefulMigrationGVR).Namespace(defaultNamespace).Get(context.TODO(),
		fmt.Sprintf("backup-%s", backupID), metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get StatefulMigration CR", "backupID", backupID)
		common.Fail(c, err)
		return
	}

	backup := statefulMigrationToBackup(unstructuredObj)
	common.Success(c, backup)
}

// handleCreateBackup creates a new backup configuration
func handleCreateBackup(c *gin.Context) {
	var req CreateBackupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind backup request")
		common.Fail(c, err)
		return
	}

	// Validate cron expression if schedule type is cron
	if req.Schedule.Type == "cron" {
		if err := validateCronExpression(req.Schedule.Value); err != nil {
			klog.ErrorS(err, "Invalid cron expression", "cron", req.Schedule.Value)
			common.Fail(c, fmt.Errorf("invalid cron expression: %v", err))
			return
		}
	}

	// Get registry information
	registry, err := getRegistryByID(req.RegistryID)
	if err != nil {
		klog.ErrorS(err, "Failed to get registry", "registryID", req.RegistryID)
		common.Fail(c, err)
		return
	}

	// Generate unique ID for the backup
	backupID := generateBackupID(req.Name)

	// Create StatefulMigration CR
	statefulMigration := createStatefulMigrationCR(backupID, req, registry)

	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}
	_, err = dynamicClient.Resource(statefulMigrationGVR).Namespace(defaultNamespace).Create(context.TODO(),
		statefulMigration, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create StatefulMigration CR")
		common.Fail(c, err)
		return
	}

	backup := statefulMigrationToBackup(statefulMigration)
	common.Success(c, backup)
}

// handleUpdateBackup updates an existing backup configuration
func handleUpdateBackup(c *gin.Context) {
	backupID := c.Param("id")
	var req UpdateBackupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind backup update request")
		common.Fail(c, err)
		return
	}

	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}
	smName := fmt.Sprintf("backup-%s", backupID)

	// Get existing StatefulMigration CR
	unstructuredObj, err := dynamicClient.Resource(statefulMigrationGVR).Namespace(defaultNamespace).Get(context.TODO(),
		smName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get StatefulMigration CR for update", "backupID", backupID)
		common.Fail(c, err)
		return
	}

	// Update the CR with new values
	updated := updateStatefulMigrationCR(unstructuredObj, req)

	_, err = dynamicClient.Resource(statefulMigrationGVR).Namespace(defaultNamespace).Update(context.TODO(),
		updated, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update StatefulMigration CR")
		common.Fail(c, err)
		return
	}

	backup := statefulMigrationToBackup(updated)
	common.Success(c, backup)
}

// handleDeleteBackup deletes a backup configuration
func handleDeleteBackup(c *gin.Context) {
	backupID := c.Param("id")
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	smName := fmt.Sprintf("backup-%s", backupID)
	err = dynamicClient.Resource(statefulMigrationGVR).Namespace(defaultNamespace).Delete(context.TODO(),
		smName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete StatefulMigration CR", "backupID", backupID)
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Backup configuration deleted successfully",
	})
}

// handleExecuteBackup executes a backup immediately
func handleExecuteBackup(c *gin.Context) {
	backupID := c.Param("id")
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the StatefulMigration CR
	smName := fmt.Sprintf("backup-%s", backupID)
	unstructuredObj, err := dynamicClient.Resource(statefulMigrationGVR).Namespace(defaultNamespace).Get(context.TODO(),
		smName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get StatefulMigration CR", "backupID", backupID)
		common.Fail(c, err)
		return
	}

	// Trigger immediate backup by updating the CR with a new execution timestamp
	spec, found, err := unstructured.NestedMap(unstructuredObj.Object, "spec")
	if err != nil || !found {
		common.Fail(c, fmt.Errorf("failed to get spec from StatefulMigration CR"))
		return
	}

	// Add immediate execution trigger
	spec["executeNow"] = time.Now().Unix()
	unstructured.SetNestedMap(unstructuredObj.Object, spec, "spec")

	_, err = dynamicClient.Resource(statefulMigrationGVR).Namespace(defaultNamespace).Update(context.TODO(),
		unstructuredObj, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to trigger backup execution")
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Backup execution triggered successfully",
	})
}

// handleGetResourcesInCluster gets available resources (pods/statefulsets) in a specific cluster
func handleGetResourcesInCluster(c *gin.Context) {
	clusterName := c.Param("cluster")
	resourceType := c.Query("type") // "pod" or "statefulset"
	namespace := c.Query("namespace")

	if resourceType == "" {
		common.Fail(c, fmt.Errorf("resource type is required"))
		return
	}

	// Get member cluster client
	memberClient, err := getMemberClusterClient(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get member cluster client", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	var resources []map[string]interface{}

	switch resourceType {
	case "pod":
		resources, err = getPodsInCluster(memberClient, namespace)
	case "statefulset":
		resources, err = getStatefulSetsInCluster(memberClient, namespace)
	default:
		common.Fail(c, fmt.Errorf("unsupported resource type: %s", resourceType))
		return
	}

	if err != nil {
		klog.ErrorS(err, "Failed to get resources", "cluster", clusterName, "type", resourceType)
		common.Fail(c, err)
		return
	}

	common.Success(c, map[string]interface{}{
		"resources": resources,
		"total":     len(resources),
	})
}

// Helper functions

func statefulMigrationToBackup(sm *unstructured.Unstructured) BackupConfiguration {
	// Extract information from StatefulMigration CR and convert to BackupConfiguration
	// Use direct field access instead of NestedMap to avoid deep copy issues with string slices
	backup := BackupConfiguration{
		ID:        sm.GetLabels()["backup-id"],
		Name:      sm.GetName(),
		Status:    "Active", // Default status
		CreatedAt: sm.GetCreationTimestamp().Format(time.RFC3339),
		UpdatedAt: sm.GetCreationTimestamp().Format(time.RFC3339),
	}

	// Extract other fields from spec using direct field access
	if clusters, found, _ := unstructured.NestedStringSlice(sm.Object, "spec", "sourceClusters"); found {
		backup.Cluster = strings.Join(clusters, ",")
	}
	if resourceType, found, _ := unstructured.NestedString(sm.Object, "spec", "resourceRef", "kind"); found {
		backup.ResourceType = resourceType
	}
	if resourceName, found, _ := unstructured.NestedString(sm.Object, "spec", "resourceRef", "name"); found {
		backup.ResourceName = resourceName
	}
	if namespace, found, _ := unstructured.NestedString(sm.Object, "spec", "resourceRef", "namespace"); found {
		backup.Namespace = namespace
	}
	if repository, found, _ := unstructured.NestedString(sm.Object, "spec", "registry", "repository"); found {
		backup.Repository = repository
	}

	// Extract registry info
	if registrySecretName, found, _ := unstructured.NestedString(sm.Object, "spec", "registry", "secretRef", "name"); found {
		registry, _ := getRegistryByName(registrySecretName)
		backup.Registry = RegistryInfo{
			ID:       registry.ID,
			Name:     registry.Name,
			Registry: registry.Registry,
		}
	}

	// Extract schedule info
	if scheduleValue, found, _ := unstructured.NestedString(sm.Object, "spec", "schedule"); found {
		backup.Schedule = ScheduleConfig{
			Type:    "cron",
			Value:   scheduleValue,
			Enabled: true,
		}
	}

	return backup
}

func createStatefulMigrationCR(backupID string, req CreateBackupRequest, registry RegistryCredentials) *unstructured.Unstructured {
	sm := &unstructured.Unstructured{}
	sm.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   "migration.dcnlab.com",
		Version: "v1",
		Kind:    "StatefulMigration",
	})

	sm.SetName(fmt.Sprintf("backup-%s", backupID))
	sm.SetNamespace(defaultNamespace)

	// Set labels
	sm.SetLabels(map[string]string{
		"app":       "backup-migration",
		"backup-id": backupID,
		"type":      "backup",
	})

	// Set annotations
	sm.SetAnnotations(map[string]string{
		"backup.dcnlab.com/created-at": time.Now().Format(time.RFC3339),
	})

	// Convert schedule selection to cron if needed
	cronExpression := req.Schedule.Value
	if req.Schedule.Type == "selection" {
		cronExpression = selectionToCron(req.Schedule.Value)
	}

	// Determine API version based on resource type
	var apiVersion string
	switch strings.ToLower(req.ResourceType) {
	case "pod":
		apiVersion = "v1"
	case "statefulset":
		apiVersion = "apps/v1"
	default:
		apiVersion = "v1" // Default fallback
	}

	// Create spec according to StatefulMigration CRD format
	spec := map[string]interface{}{
		"sourceClusters": []string{req.Cluster},
		"resourceRef": map[string]interface{}{
			"apiVersion": apiVersion,
			"kind":       req.ResourceType,
			"name":       req.ResourceName,
			"namespace":  req.Namespace,
		},
		"registry": map[string]interface{}{
			"url":        registry.Registry, // Registry URL is required
			"repository": req.Repository,
			"secretRef": map[string]interface{}{
				"name": fmt.Sprintf("%s-%s", registrySecretPrefix, req.RegistryID),
			},
		},
		"schedule": cronExpression, // Should be a string (cron expression)
	}

	sm.Object = map[string]interface{}{
		"apiVersion": "migration.dcnlab.com/v1",
		"kind":       "StatefulMigration",
		"metadata":   sm.Object["metadata"],
		"spec":       spec,
	}

	return sm
}

func updateStatefulMigrationCR(sm *unstructured.Unstructured, req UpdateBackupRequest) *unstructured.Unstructured {
	spec, _, _ := unstructured.NestedMap(sm.Object, "spec")

	// Update fields if provided
	if req.Name != "" {
		sm.SetName(req.Name)
	}
	if req.Cluster != "" {
		spec["sourceClusters"] = []string{req.Cluster}
	}

	// Update resourceRef
	if req.ResourceType != "" || req.ResourceName != "" || req.Namespace != "" {
		resourceRef, _, _ := unstructured.NestedMap(spec, "resourceRef")
		if resourceRef == nil {
			resourceRef = make(map[string]interface{})
		}
		if req.ResourceType != "" {
			// Determine API version based on resource type
			var apiVersion string
			switch strings.ToLower(req.ResourceType) {
			case "pod":
				apiVersion = "v1"
			case "statefulset":
				apiVersion = "apps/v1"
			default:
				apiVersion = "v1" // Default fallback
			}
			resourceRef["apiVersion"] = apiVersion
			resourceRef["kind"] = req.ResourceType
		}
		if req.ResourceName != "" {
			resourceRef["name"] = req.ResourceName
		}
		if req.Namespace != "" {
			resourceRef["namespace"] = req.Namespace
		}
		spec["resourceRef"] = resourceRef
	}

	// Update registry
	if req.RegistryID != "" || req.Repository != "" {
		registry, _, _ := unstructured.NestedMap(spec, "registry")
		if registry == nil {
			registry = make(map[string]interface{})
		}
		if req.Repository != "" {
			registry["repository"] = req.Repository
		}
		if req.RegistryID != "" {
			// Get registry credentials to fetch the URL
			registryCredentials, err := getRegistryByID(req.RegistryID)
			if err == nil {
				registry["url"] = registryCredentials.Registry
			}
			secretRef := map[string]interface{}{
				"name": fmt.Sprintf("%s-%s", registrySecretPrefix, req.RegistryID),
			}
			registry["secretRef"] = secretRef
		}
		spec["registry"] = registry
	}

	if req.Schedule.Type != "" {
		var cronExpression string
		if req.Schedule.Type == "selection" {
			cronExpression = selectionToCron(req.Schedule.Value)
		} else {
			cronExpression = req.Schedule.Value
		}
		spec["schedule"] = cronExpression // Should be a string, not an object
	}

	// Update timestamp
	annotations := sm.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}
	annotations["backup.dcnlab.com/updated-at"] = time.Now().Format(time.RFC3339)
	sm.SetAnnotations(annotations)

	unstructured.SetNestedMap(sm.Object, spec, "spec")
	return sm
}

func generateBackupID(name string) string {
	return fmt.Sprintf("%s-%d", strings.ToLower(strings.ReplaceAll(name, " ", "-")), time.Now().Unix())
}

func selectionToCron(selection string) string {
	switch selection {
	case "5m":
		return "*/5 * * * *"
	case "15m":
		return "*/15 * * * *"
	case "30m":
		return "*/30 * * * *"
	case "1h":
		return "0 * * * *"
	default:
		return "0 0 * * *" // Daily by default
	}
}

func validateCronExpression(cron string) error {
	// Basic cron validation - you might want to use a proper cron library
	parts := strings.Fields(cron)
	if len(parts) != 5 {
		return fmt.Errorf("cron expression must have 5 fields")
	}
	return nil
}

func getRegistryByName(secretName string) (RegistryCredentials, error) {
	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		return RegistryCredentials{}, fmt.Errorf("failed to get Karmada dynamic client: %v", err)
	}

	// Define secret GVR
	secretGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "secrets",
	}

	// Get secret from Karmada
	secretUnstructured, err := karmadaDynamicClient.Resource(secretGVR).Namespace(registryNamespace).Get(context.TODO(), secretName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get secret", "secretName", secretName)
		return RegistryCredentials{}, err
	}

	// Convert unstructured to typed Secret
	secret := &corev1.Secret{}
	err = convertUnstructuredToTyped(secretUnstructured, secret)
	if err != nil {
		return RegistryCredentials{}, fmt.Errorf("failed to convert secret: %v", err)
	}

	return secretToRegistry(secret), nil
}

func getRegistryByID(registryID string) (RegistryCredentials, error) {
	klog.InfoS("registryID", "registryID", registryID)
	// Construct secret name from registry ID
	secretName := fmt.Sprintf("%s-%s", registrySecretPrefix, registryID)

	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		return RegistryCredentials{}, fmt.Errorf("failed to get Karmada dynamic client: %v", err)
	}

	// Define secret GVR
	secretGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "secrets",
	}

	// Get secret from Karmada
	secretUnstructured, err := karmadaDynamicClient.Resource(secretGVR).Namespace(registryNamespace).Get(context.TODO(), secretName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get secret", "secretName", secretName, "registryID", registryID)
		return RegistryCredentials{}, err
	}

	// Convert unstructured to typed Secret
	secret := &corev1.Secret{}
	err = convertUnstructuredToTyped(secretUnstructured, secret)
	if err != nil {
		return RegistryCredentials{}, fmt.Errorf("failed to convert secret: %v", err)
	}

	return secretToRegistry(secret), nil
}

func getMemberClusterClient(c *gin.Context, clusterName string) (interface{}, error) {
	// Get dynamic client for member cluster
	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		return nil, fmt.Errorf("failed to get dynamic client for member cluster %s: %v", clusterName, err)
	}
	return dynamicClient, nil
}

func getPodsInCluster(client interface{}, namespace string) ([]map[string]interface{}, error) {
	dynamicClient, ok := client.(dynamic.Interface)
	if !ok {
		return nil, fmt.Errorf("invalid client type for pods")
	}

	// Define Pod GVR
	podGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "pods",
	}

	// List pods in the specified namespace (or all namespaces if empty)
	var unstructuredList *unstructured.UnstructuredList
	var err error

	if namespace != "" {
		unstructuredList, err = dynamicClient.Resource(podGVR).Namespace(namespace).List(context.TODO(), metav1.ListOptions{})
	} else {
		unstructuredList, err = dynamicClient.Resource(podGVR).List(context.TODO(), metav1.ListOptions{})
	}

	if err != nil {
		return nil, fmt.Errorf("failed to list pods: %v", err)
	}

	resources := make([]map[string]interface{}, 0, len(unstructuredList.Items))
	for _, item := range unstructuredList.Items {
		pod := map[string]interface{}{
			"name":       item.GetName(),
			"namespace":  item.GetNamespace(),
			"kind":       "Pod",
			"apiVersion": "v1",
		}

		// Get pod status
		if status, found, _ := unstructured.NestedString(item.Object, "status", "phase"); found {
			pod["status"] = status
		}

		resources = append(resources, pod)
	}

	return resources, nil
}

func getStatefulSetsInCluster(client interface{}, namespace string) ([]map[string]interface{}, error) {
	dynamicClient, ok := client.(dynamic.Interface)
	if !ok {
		return nil, fmt.Errorf("invalid client type for statefulsets")
	}

	// Define StatefulSet GVR
	statefulSetGVR := schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "statefulsets",
	}

	// List statefulsets in the specified namespace (or all namespaces if empty)
	var unstructuredList *unstructured.UnstructuredList
	var err error

	if namespace != "" {
		unstructuredList, err = dynamicClient.Resource(statefulSetGVR).Namespace(namespace).List(context.TODO(), metav1.ListOptions{})
	} else {
		unstructuredList, err = dynamicClient.Resource(statefulSetGVR).List(context.TODO(), metav1.ListOptions{})
	}

	if err != nil {
		return nil, fmt.Errorf("failed to list statefulsets: %v", err)
	}

	resources := make([]map[string]interface{}, 0, len(unstructuredList.Items))
	for _, item := range unstructuredList.Items {
		statefulSet := map[string]interface{}{
			"name":       item.GetName(),
			"namespace":  item.GetNamespace(),
			"kind":       "StatefulSet",
			"apiVersion": "apps/v1",
		}

		// Get statefulset status
		if replicas, found, _ := unstructured.NestedInt64(item.Object, "status", "replicas"); found {
			statefulSet["replicas"] = replicas
		}
		if readyReplicas, found, _ := unstructured.NestedInt64(item.Object, "status", "readyReplicas"); found {
			statefulSet["readyReplicas"] = readyReplicas
		}

		resources = append(resources, statefulSet)
	}

	return resources, nil
}

// Register backup routes
func init() {
	r := router.V1()

	// Backup management routes
	backupGroup := r.Group("/backup")
	{
		backupGroup.GET("", handleGetBackups)
		backupGroup.POST("", handleCreateBackup)
		backupGroup.GET("/:id", handleGetBackup)
		backupGroup.PUT("/:id", handleUpdateBackup)
		backupGroup.DELETE("/:id", handleDeleteBackup)
		backupGroup.POST("/:id/execute", handleExecuteBackup)
		backupGroup.GET("/clusters/:cluster/resources", handleGetResourcesInCluster)
	}
}
