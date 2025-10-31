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
	clusterv1alpha1 "github.com/karmada-io/karmada/pkg/apis/cluster/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/config"
)

// RecoveryRecord represents a recovery operation record
type RecoveryRecord struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	BackupID      string `json:"backupId"`
	BackupName    string `json:"backupName"`
	SourceCluster string `json:"sourceCluster"`
	TargetCluster string `json:"targetCluster"`
	ResourceType  string `json:"resourceType"`
	ResourceName  string `json:"resourceName"`
	Namespace     string `json:"namespace"`
	RecoveryType  string `json:"recoveryType"` // "restore", "migrate"
	Status        string `json:"status"`       // "pending", "running", "completed", "failed"
	Progress      int    `json:"progress"`     // 0-100
	Error         string `json:"error,omitempty"`
	StartedAt     string `json:"startedAt"`
	CompletedAt   string `json:"completedAt,omitempty"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

// CheckpointRestoreEvent represents a recovery event from CheckpointRestore CR
type CheckpointRestoreEvent struct {
	ID              string                   `json:"id"`
	Name            string                   `json:"name"`
	Namespace       string                   `json:"namespace"`
	Cluster         string                   `json:"cluster"`
	SourceCluster   string                   `json:"sourceCluster"`
	SourceResource  string                   `json:"sourceResource"`
	SourceNamespace string                   `json:"sourceNamespace"`
	TargetCluster   string                   `json:"targetCluster"`
	ResourceType    string                   `json:"resourceType"`
	ResourceName    string                   `json:"resourceName"`
	Status          string                   `json:"status"`
	Phase           string                   `json:"phase"`
	Progress        int                      `json:"progress"`
	Message         string                   `json:"message,omitempty"`
	StartTime       string                   `json:"startTime,omitempty"`
	CompletionTime  string                   `json:"completionTime,omitempty"`
	CreatedAt       string                   `json:"createdAt"`
	UpdatedAt       string                   `json:"updatedAt"`
	ContainerImages []string                 `json:"containerImages,omitempty"`
	BackupRef       map[string]interface{}   `json:"backupRef,omitempty"`
	Spec            map[string]interface{}   `json:"spec,omitempty"`
	Conditions      []map[string]interface{} `json:"conditions,omitempty"`
}

// CreateRecoveryRequest represents the request to create a new recovery operation
type CreateRecoveryRequest struct {
	Name            string `json:"name" binding:"required"`
	BackupID        string `json:"backupId" binding:"required"`
	TargetCluster   string `json:"targetCluster" binding:"required"`
	RecoveryType    string `json:"recoveryType" binding:"required,oneof=restore migrate"`
	TargetName      string `json:"targetName,omitempty"`      // Optional: different name for recovered resource
	TargetNamespace string `json:"targetNamespace,omitempty"` // Optional: different namespace
}

// RecoveryExecutionRequest represents a request to start recovery execution
type RecoveryExecutionRequest struct {
	RecoveryID string `json:"recoveryId" binding:"required"`
}

// StatefulMigrationCR for recovery operations
var recoveryStatefulMigrationGVR = schema.GroupVersionResource{
	Group:    "migration.dcnlab.com",
	Version:  "v1alpha1",
	Resource: "statefulmigrations",
}

// handleGetCheckpointRestoreEvents handles GET requests for CheckpointRestore CRs from all member clusters
func handleGetCheckpointRestoreEvents(c *gin.Context) {
	karmadaClient := client.InClusterKarmadaClient()

	// Get all member clusters
	clusterList, err := karmadaClient.ClusterV1alpha1().Clusters().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list member clusters")
		common.Fail(c, err)
		return
	}

	var allEvents []CheckpointRestoreEvent

	// CheckpointRestore GVR
	checkpointRestoreGVR := schema.GroupVersionResource{
		Group:    "migration.dcnlab.com",
		Version:  "v1",
		Resource: "checkpointrestores",
	}

	// Iterate through each cluster and fetch CheckpointRestore CRs
	for _, cluster := range clusterList.Items {
		// Skip clusters that are not ready
		isReady := false
		for _, condition := range cluster.Status.Conditions {
			if condition.Type == clusterv1alpha1.ClusterConditionReady && condition.Status == metav1.ConditionTrue {
				isReady = true
				break
			}
		}

		if !isReady {
			klog.V(4).InfoS("Skipping cluster that is not ready", "cluster", cluster.Name)
			continue
		}

		// Create dynamic client for the member cluster
		dynamicClient, err := client.GetDynamicClientForMember(c, cluster.Name)
		if err != nil {
			klog.ErrorS(err, "Failed to create dynamic client for member cluster", "cluster", cluster.Name)
			continue // Skip this cluster but continue with others
		}

		// List CheckpointRestore CRs in all namespaces
		checkpointRestoreList, err := dynamicClient.Resource(checkpointRestoreGVR).List(context.TODO(), metav1.ListOptions{})
		if err != nil {
			klog.V(4).InfoS("Failed to list CheckpointRestore CRs or CRD not available", "cluster", cluster.Name, "error", err)
			continue // Skip this cluster if CheckpointRestore CRD is not available
		}

		// Convert each CheckpointRestore CR to CheckpointRestoreEvent
		for _, checkpointRestore := range checkpointRestoreList.Items {
			event := convertCheckpointRestoreToEvent(&checkpointRestore, cluster.Name)
			allEvents = append(allEvents, event)
		}
	}

	common.Success(c, map[string]interface{}{
		"events": allEvents,
		"total":  len(allEvents),
	})
}

// convertCheckpointRestoreToEvent converts a CheckpointRestore CR to CheckpointRestoreEvent
func convertCheckpointRestoreToEvent(cr *unstructured.Unstructured, clusterName string) CheckpointRestoreEvent {
	event := CheckpointRestoreEvent{
		ID:              fmt.Sprintf("%s-%s-%s", clusterName, cr.GetNamespace(), cr.GetName()),
		Name:            cr.GetName(),
		Namespace:       cr.GetNamespace(),
		Cluster:         clusterName,
		CreatedAt:       cr.GetCreationTimestamp().Format(time.RFC3339),
		Spec:            make(map[string]interface{}),
		Conditions:      make([]map[string]interface{}, 0),
		ContainerImages: make([]string, 0),
		BackupRef:       make(map[string]interface{}),
	}

	// Extract spec information
	if spec, found, _ := unstructured.NestedMap(cr.Object, "spec"); found {
		event.Spec = spec

		// Extract target cluster - try multiple possible field names
		if targetCluster, found, _ := unstructured.NestedString(spec, "targetCluster"); found {
			event.TargetCluster = targetCluster
		} else if targetCluster, found, _ := unstructured.NestedString(spec, "destination"); found {
			event.TargetCluster = targetCluster
		} else if targetCluster, found, _ := unstructured.NestedString(spec, "destCluster"); found {
			event.TargetCluster = targetCluster
		} else {
			// Fallback: Use the cluster where this CR is found as target cluster
			event.TargetCluster = clusterName
		}

		// Try to extract backup reference - check multiple possible field names
		var backupRef map[string]interface{}
		var backupRefFound bool

		if backupRef, backupRefFound, _ = unstructured.NestedMap(spec, "backupRef"); backupRefFound {
			event.BackupRef = backupRef
		} else if backupRef, backupRefFound, _ = unstructured.NestedMap(spec, "backup"); backupRefFound {
			event.BackupRef = backupRef
		} else if backupRef, backupRefFound, _ = unstructured.NestedMap(spec, "source"); backupRefFound {
			event.BackupRef = backupRef
		}

		if backupRefFound {
			// Extract source cluster from backup reference - try multiple field names
			if sourceCluster, found, _ := unstructured.NestedString(backupRef, "cluster"); found {
				event.SourceCluster = sourceCluster
			} else if sourceCluster, found, _ := unstructured.NestedString(backupRef, "sourceCluster"); found {
				event.SourceCluster = sourceCluster
			} else if sourceCluster, found, _ := unstructured.NestedString(backupRef, "clusterName"); found {
				event.SourceCluster = sourceCluster
			} else if backupName, found, _ := unstructured.NestedString(backupRef, "name"); found {
				// The backup reference name might contain cluster information
				// Common patterns: backup-{cluster}-{resource}, {cluster}-backup-{resource}, etc.
				if strings.Contains(backupName, "-") {
					parts := strings.Split(backupName, "-")
					// Try to identify cluster name from backup name patterns
					for _, part := range parts {
						if part != "backup" && part != "checkpoint" && len(part) > 2 {
							event.SourceCluster = part
							break
						}
					}
				}
			} else if namespace, found, _ := unstructured.NestedString(backupRef, "namespace"); found {
				// If backup is in a cluster-specific namespace, extract cluster from namespace
				if strings.HasPrefix(namespace, "cluster-") {
					event.SourceCluster = strings.TrimPrefix(namespace, "cluster-")
				} else if namespace != "default" && namespace != "kube-system" && namespace != config.GetNamespace() {
					// Use namespace as source cluster if it's not a system namespace
					event.SourceCluster = namespace
				}
			}

			// Extract source resource information from backup reference
			var resourceRef map[string]interface{}
			var resourceRefFound bool

			if resourceRef, resourceRefFound, _ = unstructured.NestedMap(backupRef, "resourceRef"); resourceRefFound {
				// Found resourceRef
			} else if resourceRef, resourceRefFound, _ = unstructured.NestedMap(backupRef, "resource"); resourceRefFound {
				// Found resource
			} else if resourceRef, resourceRefFound, _ = unstructured.NestedMap(backupRef, "target"); resourceRefFound {
				// Found target
			}

			if resourceRefFound {
				if resourceType, found, _ := unstructured.NestedString(resourceRef, "kind"); found {
					event.ResourceType = resourceType
				}
				if resourceName, found, _ := unstructured.NestedString(resourceRef, "name"); found {
					event.SourceResource = resourceName
					event.ResourceName = resourceName // Also set as main resource name
				}
				if namespace, found, _ := unstructured.NestedString(resourceRef, "namespace"); found {
					event.SourceNamespace = namespace
				}
			}
		}

		// Try to extract resource info directly from spec (regardless of backup reference)
		if resourceRef, found, _ := unstructured.NestedMap(spec, "resourceRef"); found {
			if resourceType, found, _ := unstructured.NestedString(resourceRef, "kind"); found {
				event.ResourceType = resourceType
			}
			if resourceName, found, _ := unstructured.NestedString(resourceRef, "name"); found {
				event.SourceResource = resourceName
				event.ResourceName = resourceName
			}
			if namespace, found, _ := unstructured.NestedString(resourceRef, "namespace"); found {
				event.SourceNamespace = namespace
			}
		}

		// Try alternative resource reference fields
		if event.ResourceType == "" || event.ResourceName == "" {
			// Try podName and podNamespace (common in CheckpointRestore)
			if podName, found, _ := unstructured.NestedString(spec, "podName"); found {
				event.ResourceName = podName
				event.SourceResource = podName
				if event.ResourceType == "" {
					event.ResourceType = "Pod"
				}
			}

			if podNamespace, found, _ := unstructured.NestedString(spec, "podNamespace"); found {
				event.SourceNamespace = podNamespace
			}

			// Try containers field to determine if it's a Pod
			if containers, found, _ := unstructured.NestedSlice(spec, "containers"); found && len(containers) > 0 {
				if event.ResourceType == "" {
					event.ResourceType = "Pod"
				}
			}

			// Try other possible field names
			if event.ResourceName == "" {
				if name, found, _ := unstructured.NestedString(spec, "name"); found {
					event.ResourceName = name
					event.SourceResource = name
				} else if workload, found, _ := unstructured.NestedString(spec, "workload"); found {
					event.ResourceName = workload
					event.SourceResource = workload
				}
			}

			if event.SourceNamespace == "" {
				if namespace, found, _ := unstructured.NestedString(spec, "namespace"); found {
					event.SourceNamespace = namespace
				}
			}
		}

		// Extract container images from spec if available
		if images, found, _ := unstructured.NestedStringSlice(spec, "containerImages"); found {
			event.ContainerImages = images
		}

		// Try to extract images from containers field
		if containers, found, _ := unstructured.NestedSlice(spec, "containers"); found {
			for _, container := range containers {
				if containerMap, ok := container.(map[string]interface{}); ok {
					if image, found, _ := unstructured.NestedString(containerMap, "image"); found {
						event.ContainerImages = append(event.ContainerImages, image)
					}
				}
			}
		}

		// Also try to extract images from restore.images field
		if restoreSpec, found, _ := unstructured.NestedMap(spec, "restore"); found {
			if images, found, _ := unstructured.NestedStringSlice(restoreSpec, "images"); found {
				event.ContainerImages = append(event.ContainerImages, images...)
			}
		}

		// Try to extract from checkpointInfo
		if checkpointInfo, found, _ := unstructured.NestedMap(spec, "checkpointInfo"); found {
			if images, found, _ := unstructured.NestedStringSlice(checkpointInfo, "images"); found {
				event.ContainerImages = append(event.ContainerImages, images...)
			}
		}
	}

	// Extract status information
	if status, found, _ := unstructured.NestedMap(cr.Object, "status"); found {
		if phase, found, _ := unstructured.NestedString(status, "phase"); found {
			event.Phase = phase
			event.Status = phase // Use phase as status for compatibility
		}

		if message, found, _ := unstructured.NestedString(status, "message"); found {
			event.Message = message
		}

		if progress, found, _ := unstructured.NestedInt64(status, "progress"); found {
			event.Progress = int(progress)
		}

		// Extract start time
		if startTime, found, _ := unstructured.NestedString(status, "startTime"); found {
			event.StartTime = startTime
		}

		// Extract completion time
		if completionTime, found, _ := unstructured.NestedString(status, "completionTime"); found {
			event.CompletionTime = completionTime
		}

		// Extract container images from status if not found in spec
		if len(event.ContainerImages) == 0 {
			if images, found, _ := unstructured.NestedStringSlice(status, "containerImages"); found {
				event.ContainerImages = images
			}
			// Also try to get from restoredImages field
			if images, found, _ := unstructured.NestedStringSlice(status, "restoredImages"); found {
				event.ContainerImages = append(event.ContainerImages, images...)
			}
		}

		// Extract conditions
		if conditions, found, _ := unstructured.NestedSlice(status, "conditions"); found {
			for _, condition := range conditions {
				if conditionMap, ok := condition.(map[string]interface{}); ok {
					event.Conditions = append(event.Conditions, conditionMap)
				}
			}
		}

		// Extract last update time from conditions or use current time
		if len(event.Conditions) > 0 {
			// Find the most recent condition update time
			for _, condition := range event.Conditions {
				if lastTransitionTime, found := condition["lastTransitionTime"]; found {
					if lastTransitionTimeStr, ok := lastTransitionTime.(string); ok {
						event.UpdatedAt = lastTransitionTimeStr
					}
				}
			}
		}
	}

	// Set default UpdatedAt if not found
	if event.UpdatedAt == "" {
		event.UpdatedAt = event.CreatedAt
	}

	// Additional source cluster extraction attempts if still empty
	if event.SourceCluster == "" {
		// Try to extract from labels
		if labels := cr.GetLabels(); labels != nil {
			if sourceCluster, found := labels["source-cluster"]; found {
				event.SourceCluster = sourceCluster
			} else if sourceCluster, found := labels["sourceCluster"]; found {
				event.SourceCluster = sourceCluster
			} else if sourceCluster, found := labels["migration.dcnlab.com/source-cluster"]; found {
				event.SourceCluster = sourceCluster
			}
		}

		// Try to extract from annotations
		if annotations := cr.GetAnnotations(); annotations != nil {
			if sourceCluster, found := annotations["source-cluster"]; found {
				event.SourceCluster = sourceCluster
			} else if sourceCluster, found := annotations["sourceCluster"]; found {
				event.SourceCluster = sourceCluster
			} else if sourceCluster, found := annotations["migration.dcnlab.com/source-cluster"]; found {
				event.SourceCluster = sourceCluster
			}
		}

		// Try to extract from status
		if status, found, _ := unstructured.NestedMap(cr.Object, "status"); found {
			if sourceCluster, found, _ := unstructured.NestedString(status, "sourceCluster"); found {
				event.SourceCluster = sourceCluster
			}
		}
	}

	// Try to extract resource info from status if not found in spec
	if event.ResourceName == "" || event.ResourceType == "" {
		if status, found, _ := unstructured.NestedMap(cr.Object, "status"); found {
			if event.ResourceName == "" {
				if podName, found, _ := unstructured.NestedString(status, "podName"); found {
					event.ResourceName = podName
					event.SourceResource = podName
				}
			}
			if event.ResourceType == "" {
				if resourceType, found, _ := unstructured.NestedString(status, "resourceType"); found {
					event.ResourceType = resourceType
				}
			}
			if event.SourceNamespace == "" {
				if namespace, found, _ := unstructured.NestedString(status, "namespace"); found {
					event.SourceNamespace = namespace
				}
			}
		}
	}

	// Try to extract from CR name if still missing resource info
	if event.ResourceName == "" {
		// CheckpointRestore CR names often contain resource info
		crName := cr.GetName()
		if strings.Contains(crName, "-") {
			parts := strings.Split(crName, "-")
			// Look for recognizable patterns
			for i, part := range parts {
				if part == "checkpoint" || part == "restore" {
					if i+1 < len(parts) {
						event.ResourceName = parts[i+1]
						event.SourceResource = parts[i+1]
						break
					}
				}
			}
		}
	}

	// Provide reasonable fallbacks for missing information
	if event.SourceCluster == "" {
		event.SourceCluster = "unknown-source"
	}
	if event.TargetCluster == "" {
		event.TargetCluster = clusterName // Use the cluster where the CR is found
	}
	if event.ResourceType == "" {
		event.ResourceType = "Unknown"
	}
	if event.SourceResource == "" && event.ResourceName != "" {
		event.SourceResource = event.ResourceName
	}
	if event.ResourceName == "" {
		event.ResourceName = cr.GetName() // Fallback to CR name
		event.SourceResource = cr.GetName()
	}

	// Log the final extracted values for debugging
	klog.V(4).InfoS("Extracted CheckpointRestore event data",
		"name", event.Name,
		"sourceCluster", event.SourceCluster,
		"targetCluster", event.TargetCluster,
		"resourceType", event.ResourceType,
		"sourceResource", event.SourceResource,
		"imageCount", len(event.ContainerImages))

	return event
}

// handleGetRecoveryHistory retrieves all recovery records
func handleGetRecoveryHistory(c *gin.Context) {
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// List all StatefulMigration CRs for recovery operations
	unstructuredList, err := dynamicClient.Resource(recoveryStatefulMigrationGVR).List(context.TODO(), metav1.ListOptions{
		LabelSelector: "app=recovery-migration",
	})
	if err != nil {
		klog.ErrorS(err, "Failed to list recovery StatefulMigration CRs")
		common.Fail(c, err)
		return
	}

	recoveries := make([]RecoveryRecord, 0, len(unstructuredList.Items))
	for _, item := range unstructuredList.Items {
		recovery := statefulMigrationToRecovery(&item)
		recoveries = append(recoveries, recovery)
	}

	common.Success(c, map[string]interface{}{
		"recoveries": recoveries,
		"total":      len(recoveries),
	})
}

// handleGetRecoveryRecord retrieves a specific recovery record
func handleGetRecoveryRecord(c *gin.Context) {
	recoveryID := c.Param("id")
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the StatefulMigration CR for recovery
	unstructuredObj, err := dynamicClient.Resource(recoveryStatefulMigrationGVR).Namespace(config.GetNamespace()).Get(context.TODO(),
		fmt.Sprintf("recovery-%s", recoveryID), metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get recovery StatefulMigration CR", "recoveryID", recoveryID)
		common.Fail(c, err)
		return
	}

	recovery := statefulMigrationToRecovery(unstructuredObj)
	common.Success(c, recovery)
}

// handleCreateRecovery creates a new recovery operation
func handleCreateRecovery(c *gin.Context) {
	var req CreateRecoveryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind recovery request")
		common.Fail(c, err)
		return
	}

	// Get backup configuration to extract source information
	backup, err := getBackupByID(req.BackupID)
	if err != nil {
		klog.ErrorS(err, "Failed to get backup configuration", "backupID", req.BackupID)
		common.Fail(c, err)
		return
	}

	// Generate unique ID for the recovery
	recoveryID := generateRecoveryID(req.Name)

	// Create StatefulMigration CR for recovery
	statefulMigration := createRecoveryStatefulMigrationCR(recoveryID, req, backup)

	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}
	_, err = dynamicClient.Resource(recoveryStatefulMigrationGVR).Namespace(config.GetNamespace()).Create(context.TODO(),
		statefulMigration, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create recovery StatefulMigration CR")
		common.Fail(c, err)
		return
	}

	recovery := statefulMigrationToRecovery(statefulMigration)
	common.Success(c, recovery)
}

// handleExecuteRecovery starts the execution of a recovery operation
func handleExecuteRecovery(c *gin.Context) {
	recoveryID := c.Param("id")
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the StatefulMigration CR
	smName := fmt.Sprintf("recovery-%s", recoveryID)
	unstructuredObj, err := dynamicClient.Resource(recoveryStatefulMigrationGVR).Namespace(config.GetNamespace()).Get(context.TODO(),
		smName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get recovery StatefulMigration CR", "recoveryID", recoveryID)
		common.Fail(c, err)
		return
	}

	// Update the CR to trigger recovery execution
	spec, found, err := unstructured.NestedMap(unstructuredObj.Object, "spec")
	if err != nil || !found {
		common.Fail(c, fmt.Errorf("failed to get spec from recovery StatefulMigration CR"))
		return
	}

	// Add execution trigger
	spec["executeNow"] = time.Now().Unix()
	spec["phase"] = "running"
	unstructured.SetNestedMap(unstructuredObj.Object, spec, "spec")

	// Update status
	status := map[string]interface{}{
		"phase":     "running",
		"startedAt": time.Now().Format(time.RFC3339),
		"progress":  0,
	}
	unstructured.SetNestedMap(unstructuredObj.Object, status, "status")

	_, err = dynamicClient.Resource(recoveryStatefulMigrationGVR).Namespace(config.GetNamespace()).Update(context.TODO(),
		unstructuredObj, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to trigger recovery execution")
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Recovery execution started successfully",
	})
}

// handleDeleteRecoveryRecord deletes a recovery record
func handleDeleteRecoveryRecord(c *gin.Context) {
	recoveryID := c.Param("id")
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	smName := fmt.Sprintf("recovery-%s", recoveryID)
	err = dynamicClient.Resource(recoveryStatefulMigrationGVR).Namespace(config.GetNamespace()).Delete(context.TODO(),
		smName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete recovery StatefulMigration CR", "recoveryID", recoveryID)
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Recovery record deleted successfully",
	})
}

// handleCancelRecovery cancels a running recovery operation
func handleCancelRecovery(c *gin.Context) {
	recoveryID := c.Param("id")
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// Get the StatefulMigration CR
	smName := fmt.Sprintf("recovery-%s", recoveryID)
	unstructuredObj, err := dynamicClient.Resource(recoveryStatefulMigrationGVR).Namespace(config.GetNamespace()).Get(context.TODO(),
		smName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get recovery StatefulMigration CR", "recoveryID", recoveryID)
		common.Fail(c, err)
		return
	}

	// Update the CR to cancel recovery
	spec, found, err := unstructured.NestedMap(unstructuredObj.Object, "spec")
	if err != nil || !found {
		common.Fail(c, fmt.Errorf("failed to get spec from recovery StatefulMigration CR"))
		return
	}

	spec["phase"] = "cancelled"
	unstructured.SetNestedMap(unstructuredObj.Object, spec, "spec")

	// Update status
	status := map[string]interface{}{
		"phase":       "cancelled",
		"completedAt": time.Now().Format(time.RFC3339),
	}
	unstructured.SetNestedMap(unstructuredObj.Object, status, "status")

	_, err = dynamicClient.Resource(recoveryStatefulMigrationGVR).Namespace(config.GetNamespace()).Update(context.TODO(),
		unstructuredObj, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to cancel recovery")
		common.Fail(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Recovery operation cancelled successfully",
	})
}

// handleGetBackupHistory retrieves backup executions for a specific backup configuration
func handleGetBackupHistory(c *gin.Context) {
	backupID := c.Param("backupId")
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// List all backup executions for this backup configuration
	// This could be stored as ConfigMaps or separate CRs tracking backup execution history
	unstructuredList, err := dynamicClient.Resource(schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "configmaps",
	}).Namespace(config.GetNamespace()).List(context.TODO(), metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app=backup-history,backup-id=%s", backupID),
	})
	if err != nil {
		klog.ErrorS(err, "Failed to list backup history", "backupID", backupID)
		common.Fail(c, err)
		return
	}

	history := make([]map[string]interface{}, 0, len(unstructuredList.Items))
	for _, item := range unstructuredList.Items {
		historyItem := configMapToBackupHistory(&item)
		history = append(history, historyItem)
	}

	common.Success(c, map[string]interface{}{
		"history": history,
		"total":   len(history),
	})
}

// Helper functions

func statefulMigrationToRecovery(sm *unstructured.Unstructured) RecoveryRecord {
	spec, _, _ := unstructured.NestedMap(sm.Object, "spec")
	status, _, _ := unstructured.NestedMap(sm.Object, "status")

	recovery := RecoveryRecord{
		ID:        sm.GetLabels()["recovery-id"],
		Name:      sm.GetName(),
		CreatedAt: sm.GetCreationTimestamp().Format(time.RFC3339),
		UpdatedAt: sm.GetCreationTimestamp().Format(time.RFC3339),
		Status:    "pending", // Default status
		Progress:  0,
	}

	// Extract fields from spec
	if backupID, found, _ := unstructured.NestedString(spec, "backupID"); found {
		recovery.BackupID = backupID
	}
	if backupName, found, _ := unstructured.NestedString(spec, "backupName"); found {
		recovery.BackupName = backupName
	}
	if sourceCluster, found, _ := unstructured.NestedString(spec, "sourceCluster"); found {
		recovery.SourceCluster = sourceCluster
	}
	if targetCluster, found, _ := unstructured.NestedString(spec, "targetCluster"); found {
		recovery.TargetCluster = targetCluster
	}
	if resourceType, found, _ := unstructured.NestedString(spec, "resourceType"); found {
		recovery.ResourceType = resourceType
	}
	if resourceName, found, _ := unstructured.NestedString(spec, "resourceName"); found {
		recovery.ResourceName = resourceName
	}
	if namespace, found, _ := unstructured.NestedString(spec, "namespace"); found {
		recovery.Namespace = namespace
	}
	if recoveryType, found, _ := unstructured.NestedString(spec, "recoveryType"); found {
		recovery.RecoveryType = recoveryType
	}

	// Extract fields from status
	if phase, found, _ := unstructured.NestedString(status, "phase"); found {
		recovery.Status = phase
	}
	if progress, found, _ := unstructured.NestedInt64(status, "progress"); found {
		recovery.Progress = int(progress)
	}
	if errorMsg, found, _ := unstructured.NestedString(status, "error"); found {
		recovery.Error = errorMsg
	}
	if startedAt, found, _ := unstructured.NestedString(status, "startedAt"); found {
		recovery.StartedAt = startedAt
	}
	if completedAt, found, _ := unstructured.NestedString(status, "completedAt"); found {
		recovery.CompletedAt = completedAt
	}

	return recovery
}

func createRecoveryStatefulMigrationCR(recoveryID string, req CreateRecoveryRequest, backup BackupConfiguration) *unstructured.Unstructured {
	sm := &unstructured.Unstructured{}
	sm.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   "migration.dcnlab.com",
		Version: "v1alpha1",
		Kind:    "StatefulMigration",
	})

	sm.SetName(fmt.Sprintf("recovery-%s", recoveryID))
	sm.SetNamespace(config.GetNamespace())

	// Set labels
	sm.SetLabels(map[string]string{
		"app":         "recovery-migration",
		"recovery-id": recoveryID,
		"backup-id":   req.BackupID,
		"type":        "recovery",
	})

	// Set annotations
	sm.SetAnnotations(map[string]string{
		"recovery.dcnlab.com/created-at": time.Now().Format(time.RFC3339),
	})

	// Determine target name and namespace
	targetName := backup.ResourceName
	if req.TargetName != "" {
		targetName = req.TargetName
	}

	targetNamespace := backup.Namespace
	if req.TargetNamespace != "" {
		targetNamespace = req.TargetNamespace
	}

	// Create spec
	spec := map[string]interface{}{
		"backupID":        req.BackupID,
		"backupName":      backup.Name,
		"sourceCluster":   backup.Cluster,
		"targetCluster":   req.TargetCluster,
		"resourceType":    backup.ResourceType,
		"resourceName":    backup.ResourceName,
		"namespace":       backup.Namespace,
		"targetName":      targetName,
		"targetNamespace": targetNamespace,
		"recoveryType":    req.RecoveryType,
		"imageRepository": fmt.Sprintf("%s/%s", backup.Registry.Registry, backup.Repository),
		"registryID":      backup.Registry.ID,
		"phase":           "pending",
	}

	// Create initial status
	status := map[string]interface{}{
		"phase":    "pending",
		"progress": 0,
	}

	sm.Object = map[string]interface{}{
		"apiVersion": "migration.dcnlab.com/v1alpha1",
		"kind":       "StatefulMigration",
		"metadata":   sm.Object["metadata"],
		"spec":       spec,
		"status":     status,
	}

	return sm
}

func generateRecoveryID(name string) string {
	return fmt.Sprintf("recovery-%s-%d", strings.ToLower(strings.ReplaceAll(name, " ", "-")), time.Now().Unix())
}

func getBackupByID(backupID string) (BackupConfiguration, error) {
	dynamicClient, err := client.GetDynamicClient()
	if err != nil {
		return BackupConfiguration{}, err
	}
	smName := fmt.Sprintf("backup-%s", backupID)

	unstructuredObj, err := dynamicClient.Resource(statefulMigrationGVR).Namespace(config.GetNamespace()).Get(context.TODO(),
		smName, metav1.GetOptions{})
	if err != nil {
		return BackupConfiguration{}, err
	}

	return statefulMigrationToBackup(unstructuredObj), nil
}

func configMapToBackupHistory(cm *unstructured.Unstructured) map[string]interface{} {
	data, _, _ := unstructured.NestedStringMap(cm.Object, "data")

	return map[string]interface{}{
		"id":             cm.GetName(),
		"timestamp":      data["timestamp"],
		"status":         data["status"],
		"duration":       data["duration"],
		"size":           data["size"],
		"error":          data["error"],
		"checkpointPath": data["checkpointPath"],
	}
}

// Register recovery routes
func init() {
	r := router.V1()

	// Recovery management routes
	recoveryGroup := r.Group("/backup/recovery")
	{
		recoveryGroup.GET("", handleGetRecoveryHistory)
		recoveryGroup.POST("", handleCreateRecovery)
		recoveryGroup.GET("/:id", handleGetRecoveryRecord)
		recoveryGroup.POST("/:id/execute", handleExecuteRecovery)
		recoveryGroup.POST("/:id/cancel", handleCancelRecovery)
		recoveryGroup.DELETE("/:id", handleDeleteRecoveryRecord)

		// CheckpointRestore events endpoint
		recoveryGroup.GET("/checkpoint-restore-events", handleGetCheckpointRestoreEvents)

		// Backup history endpoint
		recoveryGroup.GET("/backup/:backupId/history", handleGetBackupHistory)
	}
}
