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

package quota

import (
	"context"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
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
	// QueueNameSuffix is the suffix used for queue names based on profile
	QueueNameSuffix = "-queue"
	// DefaultParentQueue is the default parent queue for new queues
	DefaultParentQueue = "default-parent-queue"
)

// QueueGVR defines the GroupVersionResource for KAI Scheduler Queue
var QueueGVR = schema.GroupVersionResource{
	Group:    "scheduling.run.ai",
	Version:  "v2",
	Resource: "queues",
}

// ResourceQuota represents CPU, Memory, or GPU quota configuration
// Values can be: positive numbers for limits, 0 for no quota, -1 for unlimited
type ResourceQuota struct {
	Quota float64 `json:"quota"`
	Limit float64 `json:"limit"`
}

// QuotaResources contains all resource quotas
type QuotaResources struct {
	CPU    *ResourceQuota `json:"cpu,omitempty"`
	Memory *ResourceQuota `json:"memory,omitempty"`
	GPU    *ResourceQuota `json:"gpu,omitempty"`
}

// QuotaUsage represents the current usage status for a queue
type QuotaUsage struct {
	GPUAllocated     float64 `json:"gpuAllocated"`     // GPU allocation in percentage (0-1 scale)
	GPUMemoryRequest int64   `json:"gpuMemoryRequest"` // GPU memory requested in MB
}

// QuotaAssignment represents a profile's quota assignment
type QuotaAssignment struct {
	Profile     string          `json:"profile"`
	QueueName   string          `json:"queueName"`
	ParentQueue string          `json:"parentQueue,omitempty"`
	Resources   *QuotaResources `json:"resources"`
	Usage       *QuotaUsage     `json:"usage,omitempty"`
	Username    string          `json:"username,omitempty"`
	Email       string          `json:"email,omitempty"`
	CreatedAt   string          `json:"createdAt,omitempty"`
}

// QuotaAssignmentRequest represents a request to create/update quota
type QuotaAssignmentRequest struct {
	Profile     string          `json:"profile" binding:"required"`
	ParentQueue string          `json:"parentQueue,omitempty"`
	Resources   *QuotaResources `json:"resources" binding:"required"`
}

// QuotaListResponse represents the list of all quota assignments
type QuotaListResponse struct {
	Assignments []QuotaAssignment `json:"assignments"`
	Total       int               `json:"total"`
}

// ProfileUserInfo holds user information for a profile
type ProfileUserInfo struct {
	Username string
	Email    string
}

// GetQueueNameForProfile generates the queue name for a given profile
func GetQueueNameForProfile(profile string) string {
	return profile + QueueNameSuffix
}

// GetProfileFromQueueName extracts the profile name from a queue name
func GetProfileFromQueueName(queueName string) string {
	if strings.HasSuffix(queueName, QueueNameSuffix) {
		return strings.TrimSuffix(queueName, QueueNameSuffix)
	}
	return queueName
}

// getDynamicClient returns the dynamic client for the API server
// When Karmada is enabled, it uses the Karmada API server
// When Karmada is not enabled, it uses the local Kubernetes cluster
func getDynamicClient() (dynamic.Interface, error) {
	if client.IsKarmadaEnabled() {
		karmadaConfig, _, err := client.GetKarmadaConfig()
		if err != nil {
			return nil, fmt.Errorf("failed to get Karmada config: %v", err)
		}
		dynamicClient, err := dynamic.NewForConfig(karmadaConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to create dynamic client: %v", err)
		}
		return dynamicClient, nil
	}
	
	// Use local cluster when Karmada is not enabled
	return client.GetDynamicClient()
}

// getProfileUserMap fetches all Kubeflow Profile CRs and creates a map of profile name -> user info
func getProfileUserMap(ctx context.Context) map[string]ProfileUserInfo {
	profileUserMap := make(map[string]ProfileUserInfo)

	dynamicClient, err := getDynamicClient()
	if err != nil {
		klog.V(4).InfoS("Failed to get dynamic client, profile user mapping unavailable", "error", err)
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

// parseFloat64Value extracts a float64 value from interface{}
func parseFloat64Value(val interface{}) (float64, bool) {
	switch v := val.(type) {
	case float64:
		return v, true
	case int64:
		return float64(v), true
	case int:
		return float64(v), true
	case string:
		// Try to parse string as float
		var f float64
		if _, err := fmt.Sscanf(v, "%f", &f); err == nil {
			return f, true
		}
	}
	return 0, false
}

// parseResourceQuota extracts resource quota from unstructured data
func parseResourceQuota(resourceData map[string]interface{}) *ResourceQuota {
	if resourceData == nil {
		return nil
	}

	quota := &ResourceQuota{}

	if q, ok := resourceData["quota"]; ok {
		if val, found := parseFloat64Value(q); found {
			quota.Quota = val
		}
	}
	if l, ok := resourceData["limit"]; ok {
		if val, found := parseFloat64Value(l); found {
			quota.Limit = val
		}
	}

	return quota
}

// parseUsageFromQueue extracts usage information from a Queue CR status
func parseUsageFromQueue(queue *unstructured.Unstructured) *QuotaUsage {
	status, found, err := unstructured.NestedMap(queue.Object, "status")
	if !found || err != nil {
		return nil
	}

	usage := &QuotaUsage{}

	// Parse allocated GPU (in nano percentage, e.g., 166748087n = 0.1667)
	if allocated, found, _ := unstructured.NestedMap(status, "allocated"); found {
		if gpuVal, ok := allocated["nvidia.com/gpu"]; ok {
			// Value can be string like "166748087n" or a number
			switch v := gpuVal.(type) {
			case string:
				// Remove 'n' suffix and parse as nano (divide by 1e9)
				if strings.HasSuffix(v, "n") {
					var nanoVal int64
					if _, err := fmt.Sscanf(v, "%dn", &nanoVal); err == nil {
						usage.GPUAllocated = float64(nanoVal) / 1e9
					}
				} else {
					// Try to parse as plain number
					var f float64
					if _, err := fmt.Sscanf(v, "%f", &f); err == nil {
						usage.GPUAllocated = f
					}
				}
			case float64:
				usage.GPUAllocated = v
			case int64:
				usage.GPUAllocated = float64(v)
			}
		}
	}

	// Parse requested GPU memory (in MB)
	// Supports formats: "4096" (plain number), "4k" (4000 MB), "4Ki" (4096 MB)
	if requested, found, _ := unstructured.NestedMap(status, "requested"); found {
		if memVal, ok := requested["run.ai/gpu.memory"]; ok {
			switch v := memVal.(type) {
			case string:
				usage.GPUMemoryRequest = parseMemoryValue(v)
			case float64:
				usage.GPUMemoryRequest = int64(v)
			case int64:
				usage.GPUMemoryRequest = v
			}
		}
	}

	return usage
}

// parseMemoryValue parses memory value string with optional suffix
// Supports: "4096" (plain), "4k" (4*1000=4000), "4K" (4*1000=4000), "4Ki" (4*1024=4096)
func parseMemoryValue(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}

	// Check for Ki suffix (1024-based)
	if strings.HasSuffix(s, "Ki") {
		var val int64
		if _, err := fmt.Sscanf(s, "%dKi", &val); err == nil {
			return val * 1024
		}
	}

	// Check for k or K suffix (1000-based, as per the example "4k" = 4000 MB)
	if strings.HasSuffix(s, "k") || strings.HasSuffix(s, "K") {
		numStr := strings.TrimSuffix(strings.TrimSuffix(s, "k"), "K")
		var val int64
		if _, err := fmt.Sscanf(numStr, "%d", &val); err == nil {
			return val * 1000
		}
	}

	// Try to parse as plain number
	var val int64
	if _, err := fmt.Sscanf(s, "%d", &val); err == nil {
		return val
	}

	return 0
}

// parseQuotaFromQueue extracts quota information from a Queue CR
func parseQuotaFromQueue(queue *unstructured.Unstructured) (*QuotaResources, string, *QuotaUsage, error) {
	spec, found, err := unstructured.NestedMap(queue.Object, "spec")
	if !found || err != nil {
		return nil, "", nil, fmt.Errorf("failed to get spec from queue")
	}

	// Get parent queue
	parentQueue, _, _ := unstructured.NestedString(spec, "parentQueue")

	resources, found, err := unstructured.NestedMap(spec, "resources")
	if !found || err != nil {
		return &QuotaResources{}, parentQueue, parseUsageFromQueue(queue), nil
	}

	quotaResources := &QuotaResources{}

	// Parse CPU quota
	if cpuData, found, _ := unstructured.NestedMap(resources, "cpu"); found {
		quotaResources.CPU = parseResourceQuota(cpuData)
	}

	// Parse Memory quota
	if memoryData, found, _ := unstructured.NestedMap(resources, "memory"); found {
		quotaResources.Memory = parseResourceQuota(memoryData)
	}

	// Parse GPU quota
	if gpuData, found, _ := unstructured.NestedMap(resources, "gpu"); found {
		quotaResources.GPU = parseResourceQuota(gpuData)
	}

	// Parse usage from status
	usage := parseUsageFromQueue(queue)

	return quotaResources, parentQueue, usage, nil
}

// buildQueueObject creates a Queue CR object from QuotaAssignmentRequest
func buildQueueObject(profile string, parentQueue string, resources *QuotaResources) *unstructured.Unstructured {
	queueName := GetQueueNameForProfile(profile)

	if parentQueue == "" {
		parentQueue = DefaultParentQueue
	}

	resourcesMap := make(map[string]interface{})

	if resources.CPU != nil {
		resourcesMap["cpu"] = map[string]interface{}{
			"quota": resources.CPU.Quota,
			"limit": resources.CPU.Limit,
		}
	}

	if resources.Memory != nil {
		resourcesMap["memory"] = map[string]interface{}{
			"quota": resources.Memory.Quota,
			"limit": resources.Memory.Limit,
		}
	}

	if resources.GPU != nil {
		resourcesMap["gpu"] = map[string]interface{}{
			"quota": resources.GPU.Quota,
			"limit": resources.GPU.Limit,
		}
	}

	queue := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "scheduling.run.ai/v2",
			"kind":       "Queue",
			"metadata": map[string]interface{}{
				"name": queueName,
			},
			"spec": map[string]interface{}{
				"parentQueue": parentQueue,
				"resources":   resourcesMap,
			},
		},
	}

	return queue
}

// handleGetQuotas returns all quota assignments
func handleGetQuotas(c *gin.Context) {
	ctx := context.Background()

	dynamicClient, err := getDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	// List all Queue CRs
	queues, err := dynamicClient.Resource(QueueGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list queues")
		common.Fail(c, err)
		return
	}

	// Get profile to user info mapping
	profileUserMap := getProfileUserMap(ctx)

	assignments := make([]QuotaAssignment, 0, len(queues.Items))
	for _, queue := range queues.Items {
		queueName := queue.GetName()
		profile := GetProfileFromQueueName(queueName)

		// Skip queues that don't have a matching user profile
		userInfo, exists := profileUserMap[profile]
		if !exists {
			continue
		}

		resources, parentQueue, usage, err := parseQuotaFromQueue(&queue)
		if err != nil {
			klog.V(4).InfoS("Failed to parse quota from queue", "queue", queueName, "error", err)
			continue
		}

		assignment := QuotaAssignment{
			Profile:     profile,
			QueueName:   queueName,
			ParentQueue: parentQueue,
			Resources:   resources,
			Usage:       usage,
			CreatedAt:   queue.GetCreationTimestamp().String(),
			Username:    userInfo.Username,
			Email:       userInfo.Email,
		}

		assignments = append(assignments, assignment)
	}

	response := QuotaListResponse{
		Assignments: assignments,
		Total:       len(assignments),
	}

	common.Success(c, response)
}

// handleGetQuota returns the quota for a specific profile
func handleGetQuota(c *gin.Context) {
	ctx := context.Background()
	profile := c.Param("profile")

	if profile == "" {
		common.Fail(c, fmt.Errorf("profile parameter is required"))
		return
	}

	dynamicClient, err := getDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	queueName := GetQueueNameForProfile(profile)

	// Get the Queue CR
	queue, err := dynamicClient.Resource(QueueGVR).Get(ctx, queueName, metav1.GetOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			common.Fail(c, fmt.Errorf("quota not found for profile: %s", profile))
			return
		}
		klog.ErrorS(err, "Failed to get queue", "queueName", queueName)
		common.Fail(c, err)
		return
	}

	resources, parentQueue, usage, err := parseQuotaFromQueue(queue)
	if err != nil {
		klog.ErrorS(err, "Failed to parse quota from queue", "queueName", queueName)
		common.Fail(c, err)
		return
	}

	assignment := QuotaAssignment{
		Profile:     profile,
		QueueName:   queueName,
		ParentQueue: parentQueue,
		Resources:   resources,
		Usage:       usage,
		CreatedAt:   queue.GetCreationTimestamp().String(),
	}

	// Get profile to user info mapping and add username/email if available
	profileUserMap := getProfileUserMap(ctx)
	if userInfo, exists := profileUserMap[profile]; exists {
		assignment.Username = userInfo.Username
		assignment.Email = userInfo.Email
	}

	common.Success(c, assignment)
}

// handleCreateQuota creates a new quota for a profile
func handleCreateQuota(c *gin.Context) {
	ctx := context.Background()

	var req QuotaAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind request")
		common.Fail(c, err)
		return
	}

	dynamicClient, err := getDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	queueName := GetQueueNameForProfile(req.Profile)

	// Check if queue already exists
	_, err = dynamicClient.Resource(QueueGVR).Get(ctx, queueName, metav1.GetOptions{})
	if err == nil {
		common.Fail(c, fmt.Errorf("quota already exists for profile: %s", req.Profile))
		return
	}

	// Build and create the Queue CR
	queue := buildQueueObject(req.Profile, req.ParentQueue, req.Resources)

	createdQueue, err := dynamicClient.Resource(QueueGVR).Create(ctx, queue, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create queue", "profile", req.Profile)
		common.Fail(c, err)
		return
	}

	klog.InfoS("Queue created", "profile", req.Profile, "queueName", queueName)

	resources, parentQueue, usage, _ := parseQuotaFromQueue(createdQueue)

	assignment := QuotaAssignment{
		Profile:     req.Profile,
		QueueName:   queueName,
		ParentQueue: parentQueue,
		Resources:   resources,
		Usage:       usage,
		CreatedAt:   createdQueue.GetCreationTimestamp().String(),
	}

	common.Success(c, assignment)
}

// handleUpdateQuota updates the quota for a specific profile
func handleUpdateQuota(c *gin.Context) {
	ctx := context.Background()
	profile := c.Param("profile")

	if profile == "" {
		common.Fail(c, fmt.Errorf("profile parameter is required"))
		return
	}

	var req QuotaAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind request")
		common.Fail(c, err)
		return
	}

	// Ensure profile in path matches request body
	req.Profile = profile

	dynamicClient, err := getDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	queueName := GetQueueNameForProfile(profile)

	// Get existing queue
	existingQueue, err := dynamicClient.Resource(QueueGVR).Get(ctx, queueName, metav1.GetOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			common.Fail(c, fmt.Errorf("quota not found for profile: %s", profile))
			return
		}
		klog.ErrorS(err, "Failed to get queue", "queueName", queueName)
		common.Fail(c, err)
		return
	}

	// Get existing parent queue if not specified in request
	if req.ParentQueue == "" {
		_, existingParentQueue, _, _ := parseQuotaFromQueue(existingQueue)
		req.ParentQueue = existingParentQueue
	}

	// Build updated queue object
	updatedQueue := buildQueueObject(profile, req.ParentQueue, req.Resources)
	updatedQueue.SetResourceVersion(existingQueue.GetResourceVersion())

	// Update the Queue CR
	result, err := dynamicClient.Resource(QueueGVR).Update(ctx, updatedQueue, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update queue", "profile", profile)
		common.Fail(c, err)
		return
	}

	klog.InfoS("Queue updated", "profile", profile, "queueName", queueName)

	resources, parentQueue, usage, _ := parseQuotaFromQueue(result)

	assignment := QuotaAssignment{
		Profile:     profile,
		QueueName:   queueName,
		ParentQueue: parentQueue,
		Resources:   resources,
		Usage:       usage,
		CreatedAt:   result.GetCreationTimestamp().String(),
	}

	common.Success(c, assignment)
}

// handleDeleteQuota deletes the quota for a specific profile
func handleDeleteQuota(c *gin.Context) {
	ctx := context.Background()
	profile := c.Param("profile")

	if profile == "" {
		common.Fail(c, fmt.Errorf("profile parameter is required"))
		return
	}

	dynamicClient, err := getDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client")
		common.Fail(c, err)
		return
	}

	queueName := GetQueueNameForProfile(profile)

	// Check if queue exists
	_, err = dynamicClient.Resource(QueueGVR).Get(ctx, queueName, metav1.GetOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			common.Fail(c, fmt.Errorf("quota not found for profile: %s", profile))
			return
		}
		klog.ErrorS(err, "Failed to get queue", "queueName", queueName)
		common.Fail(c, err)
		return
	}

	// Delete the Queue CR
	err = dynamicClient.Resource(QueueGVR).Delete(ctx, queueName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete queue", "profile", profile)
		common.Fail(c, err)
		return
	}

	klog.InfoS("Queue deleted", "profile", profile, "queueName", queueName)
	common.Success(c, gin.H{"message": "Quota deleted successfully"})
}

func init() {
	v1 := router.V1()

	// Quota management routes
	v1.GET("/quota", handleGetQuotas)
	v1.GET("/quota/:profile", handleGetQuota)
	v1.POST("/quota", handleCreateQuota)
	v1.PUT("/quota/:profile", handleUpdateQuota)
	v1.DELETE("/quota/:profile", handleDeleteQuota)
}
