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

package priority

import (
	"context"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
)

const (
	ConfigMapName      = "profile-priority"
	ConfigMapNamespace = "ml-platform-system"
	DefaultPriority    = "low-priority-training"
)

// PriorityAssignment represents a profile's priority assignment
type PriorityAssignment struct {
	Profile       string `json:"profile"`
	PriorityClass string `json:"priorityClass"`
}

// PriorityAssignmentRequest represents a request to set/update priority
type PriorityAssignmentRequest struct {
	Profile       string `json:"profile" binding:"required"`
	PriorityClass string `json:"priorityClass" binding:"required,oneof=low-priority-training standard-priority-training high-priority-training"`
}

// PriorityListResponse represents the list of all priority assignments
type PriorityListResponse struct {
	Assignments []PriorityAssignment `json:"assignments"`
	Total       int                  `json:"total"`
}

// getOrCreateConfigMap retrieves or creates the profile-priority ConfigMap
func getOrCreateConfigMap(ctx context.Context) (*corev1.ConfigMap, error) {
	// Use Kubernetes client for ConfigMap access
	kubeClient := client.InClusterClientForKarmadaAPIServer()
	if kubeClient == nil {
		return nil, fmt.Errorf("failed to get kubernetes client")
	}

	// Try to get existing ConfigMap
	configMap, err := kubeClient.CoreV1().ConfigMaps(ConfigMapNamespace).Get(ctx, ConfigMapName, metav1.GetOptions{})
	if err != nil {
		if !strings.Contains(err.Error(), "not found") {
			return nil, fmt.Errorf("failed to get configmap: %v", err)
		}

		// Create new ConfigMap if it doesn't exist
		configMap = &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name:      ConfigMapName,
				Namespace: ConfigMapNamespace,
				Labels: map[string]string{
					"app.kubernetes.io/name":       "profile-priority",
					"app.kubernetes.io/component":  "priority-management",
					"app.kubernetes.io/managed-by": "ml-platform-admin",
				},
			},
			Data: make(map[string]string),
		}

		configMap, err = kubeClient.CoreV1().ConfigMaps(ConfigMapNamespace).Create(ctx, configMap, metav1.CreateOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to create configmap: %v", err)
		}
		klog.InfoS("Created profile-priority ConfigMap", "namespace", ConfigMapNamespace, "name", ConfigMapName)
	}

	// Initialize Data map if nil
	if configMap.Data == nil {
		configMap.Data = make(map[string]string)
	}

	return configMap, nil
}

// handleGetPriorities returns all priority assignments
func handleGetPriorities(c *gin.Context) {
	ctx := context.Context(c)

	configMap, err := getOrCreateConfigMap(ctx)
	if err != nil {
		klog.ErrorS(err, "Failed to get ConfigMap")
		common.Fail(c, err)
		return
	}

	assignments := make([]PriorityAssignment, 0, len(configMap.Data))
	for profile, priorityClass := range configMap.Data {
		assignments = append(assignments, PriorityAssignment{
			Profile:       profile,
			PriorityClass: priorityClass,
		})
	}

	response := PriorityListResponse{
		Assignments: assignments,
		Total:       len(assignments),
	}

	common.Success(c, response)
}

// handleGetPriority returns the priority for a specific profile
func handleGetPriority(c *gin.Context) {
	ctx := context.Context(c)
	profile := c.Param("profile")

	if profile == "" {
		common.Fail(c, fmt.Errorf("profile parameter is required"))
		return
	}

	configMap, err := getOrCreateConfigMap(ctx)
	if err != nil {
		klog.ErrorS(err, "Failed to get ConfigMap")
		common.Fail(c, err)
		return
	}

	priorityClass, exists := configMap.Data[profile]
	if !exists {
		// Return default priority if not set
		priorityClass = DefaultPriority
	}

	assignment := PriorityAssignment{
		Profile:       profile,
		PriorityClass: priorityClass,
	}

	common.Success(c, assignment)
}

// handleSetPriority sets or updates the priority for a profile
func handleSetPriority(c *gin.Context) {
	ctx := context.Context(c)

	var req PriorityAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind request")
		common.Fail(c, err)
		return
	}

	kubeClient := client.InClusterClientForKarmadaAPIServer()
	if kubeClient == nil {
		common.Fail(c, fmt.Errorf("failed to get kubernetes client"))
		return
	}

	configMap, err := getOrCreateConfigMap(ctx)
	if err != nil {
		klog.ErrorS(err, "Failed to get ConfigMap")
		common.Fail(c, err)
		return
	}

	// Update the priority assignment
	configMap.Data[req.Profile] = req.PriorityClass

	// Update ConfigMap
	_, err = kubeClient.CoreV1().ConfigMaps(ConfigMapNamespace).Update(ctx, configMap, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update ConfigMap", "profile", req.Profile, "priorityClass", req.PriorityClass)
		common.Fail(c, err)
		return
	}

	klog.InfoS("Priority assignment updated", "profile", req.Profile, "priorityClass", req.PriorityClass)

	assignment := PriorityAssignment{
		Profile:       req.Profile,
		PriorityClass: req.PriorityClass,
	}

	common.Success(c, assignment)
}

// handleDeletePriority removes the priority assignment for a profile
func handleDeletePriority(c *gin.Context) {
	ctx := context.Context(c)
	profile := c.Param("profile")

	if profile == "" {
		common.Fail(c, fmt.Errorf("profile parameter is required"))
		return
	}

	kubeClient := client.InClusterClientForKarmadaAPIServer()
	if kubeClient == nil {
		common.Fail(c, fmt.Errorf("failed to get kubernetes client"))
		return
	}

	configMap, err := getOrCreateConfigMap(ctx)
	if err != nil {
		klog.ErrorS(err, "Failed to get ConfigMap")
		common.Fail(c, err)
		return
	}

	// Check if the profile exists
	if _, exists := configMap.Data[profile]; !exists {
		klog.InfoS("Priority assignment not found", "profile", profile)
		common.Fail(c, fmt.Errorf("priority assignment not found for profile: %s", profile))
		return
	}

	// Remove the priority assignment
	delete(configMap.Data, profile)

	// Update ConfigMap
	_, err = kubeClient.CoreV1().ConfigMaps(ConfigMapNamespace).Update(ctx, configMap, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update ConfigMap", "profile", profile)
		common.Fail(c, err)
		return
	}

	klog.InfoS("Priority assignment deleted", "profile", profile)
	common.Success(c, gin.H{"message": "Priority assignment deleted successfully"})
}

func init() {
	v1 := router.V1()

	// Priority management routes
	v1.GET("/priority", handleGetPriorities)
	v1.GET("/priority/:profile", handleGetPriority)
	v1.POST("/priority", handleSetPriority)
	v1.PUT("/priority/:profile", handleSetPriority)
	v1.DELETE("/priority/:profile", handleDeletePriority)
}

