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
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
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
	Username      string `json:"username,omitempty"`
	Email         string `json:"email,omitempty"`
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

	// Get profile to user info mapping
	profileUserMap := getProfileUserMap(ctx)

	assignments := make([]PriorityAssignment, 0, len(configMap.Data))
	for profile, priorityClass := range configMap.Data {
		assignment := PriorityAssignment{
			Profile:       profile,
			PriorityClass: priorityClass,
		}
		
		// Add username and email if available
		if userInfo, exists := profileUserMap[profile]; exists {
			assignment.Username = userInfo.Username
			assignment.Email = userInfo.Email
		}
		
		assignments = append(assignments, assignment)
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

	// Get profile to user info mapping and add username/email if available
	profileUserMap := getProfileUserMap(ctx)
	if userInfo, exists := profileUserMap[profile]; exists {
		assignment.Username = userInfo.Username
		assignment.Email = userInfo.Email
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

// ProfileUserInfo holds user information for a profile
type ProfileUserInfo struct {
	Username string
	Email    string
}

// getProfileUserMap fetches all Kubeflow Profile CRs and creates a map of profile name -> user info
func getProfileUserMap(ctx context.Context) map[string]ProfileUserInfo {
	profileUserMap := make(map[string]ProfileUserInfo)

	// Get Karmada config and create dynamic client
	karmadaConfig, _, err := client.GetKarmadaConfig()
	if err != nil {
		klog.V(4).InfoS("Failed to get Karmada config, profile user mapping unavailable", "error", err)
		return profileUserMap
	}

	dynamicClient, err := dynamic.NewForConfig(karmadaConfig)
	if err != nil {
		klog.V(4).InfoS("Failed to create dynamic client, profile user mapping unavailable", "error", err)
		return profileUserMap
	}

	// Define the Kubeflow Profile GVR
	profileGVR := schema.GroupVersionResource{
		Group:    "kubeflow.org",
		Version:  "v1",
		Resource: "profiles",
	}

	// List all Profile CRs
	profiles, err := dynamicClient.Resource(profileGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		klog.V(4).InfoS("Failed to list Kubeflow Profiles", "error", err)
		return profileUserMap
	}

	// Build map from profile name to user info
	for _, profile := range profiles.Items {
		profileName := profile.GetName()
		
		// Get owner email from spec.owner.name
		spec, found, err := unstructured.NestedMap(profile.Object, "spec")
		if !found || err != nil {
			continue
		}

		owner, found, err := unstructured.NestedMap(spec, "owner")
		if !found || err != nil {
			continue
		}

		ownerEmail, found, err := unstructured.NestedString(owner, "name")
		if !found || err != nil {
			continue
		}

		// Extract username from email (part before @)
		username := ownerEmail
		if atIndex := strings.Index(ownerEmail, "@"); atIndex > 0 {
			username = ownerEmail[:atIndex]
		}

		profileUserMap[profileName] = ProfileUserInfo{
			Username: username,
			Email:    ownerEmail,
		}
	}

	klog.V(4).InfoS("Built profile user map", "count", len(profileUserMap))
	return profileUserMap
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

