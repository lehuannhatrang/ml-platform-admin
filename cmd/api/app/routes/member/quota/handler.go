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
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	quotaroutes "github.com/karmada-io/dashboard/cmd/api/app/routes/quota"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
)

// handleGetMemberQuotas returns all quota assignments from a member cluster
func handleGetMemberQuotas(c *gin.Context) {
	ctx := context.Background()
	clusterName := c.Param("clustername")

	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client for member cluster", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// List all Queue CRs
	queues, err := dynamicClient.Resource(quotaroutes.QueueGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list queues", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// Get profile to user info mapping
	profileUserMap := getProfileUserMapForMember(ctx, clusterName)

	assignments := make([]quotaroutes.QuotaAssignment, 0, len(queues.Items))
	for _, queue := range queues.Items {
		queueName := queue.GetName()
		profile := quotaroutes.GetProfileFromQueueName(queueName)

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

		assignment := quotaroutes.QuotaAssignment{
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

	response := quotaroutes.QuotaListResponse{
		Assignments: assignments,
		Total:       len(assignments),
	}

	common.Success(c, response)
}

// handleGetMemberQuota returns the quota for a specific profile from a member cluster
func handleGetMemberQuota(c *gin.Context) {
	ctx := context.Background()
	clusterName := c.Param("clustername")
	profile := c.Param("profile")

	if profile == "" {
		common.Fail(c, fmt.Errorf("profile parameter is required"))
		return
	}

	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client for member cluster", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	queueName := quotaroutes.GetQueueNameForProfile(profile)

	// Get the Queue CR
	queue, err := dynamicClient.Resource(quotaroutes.QueueGVR).Get(ctx, queueName, metav1.GetOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			common.Fail(c, fmt.Errorf("quota not found for profile: %s in cluster: %s", profile, clusterName))
			return
		}
		klog.ErrorS(err, "Failed to get queue", "queueName", queueName, "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	resources, parentQueue, usage, err := parseQuotaFromQueue(queue)
	if err != nil {
		klog.ErrorS(err, "Failed to parse quota from queue", "queueName", queueName)
		common.Fail(c, err)
		return
	}

	assignment := quotaroutes.QuotaAssignment{
		Profile:     profile,
		QueueName:   queueName,
		ParentQueue: parentQueue,
		Resources:   resources,
		Usage:       usage,
		CreatedAt:   queue.GetCreationTimestamp().String(),
	}

	// Get profile to user info mapping and add username/email if available
	profileUserMap := getProfileUserMapForMember(ctx, clusterName)
	if userInfo, exists := profileUserMap[profile]; exists {
		assignment.Username = userInfo.Username
		assignment.Email = userInfo.Email
	}

	common.Success(c, assignment)
}

// handleCreateMemberQuota creates a new quota for a profile in a member cluster
func handleCreateMemberQuota(c *gin.Context) {
	ctx := context.Background()
	clusterName := c.Param("clustername")

	var req quotaroutes.QuotaAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind request")
		common.Fail(c, err)
		return
	}

	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client for member cluster", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	queueName := quotaroutes.GetQueueNameForProfile(req.Profile)

	// Check if queue already exists
	_, err = dynamicClient.Resource(quotaroutes.QueueGVR).Get(ctx, queueName, metav1.GetOptions{})
	if err == nil {
		common.Fail(c, fmt.Errorf("quota already exists for profile: %s in cluster: %s", req.Profile, clusterName))
		return
	}

	// Build and create the Queue CR
	queue := buildQueueObject(req.Profile, req.ParentQueue, req.Resources)

	createdQueue, err := dynamicClient.Resource(quotaroutes.QueueGVR).Create(ctx, queue, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create queue", "profile", req.Profile, "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	klog.InfoS("Queue created", "profile", req.Profile, "queueName", queueName, "cluster", clusterName)

	resources, parentQueue, usage, _ := parseQuotaFromQueue(createdQueue)

	assignment := quotaroutes.QuotaAssignment{
		Profile:     req.Profile,
		QueueName:   queueName,
		ParentQueue: parentQueue,
		Resources:   resources,
		Usage:       usage,
		CreatedAt:   createdQueue.GetCreationTimestamp().String(),
	}

	common.Success(c, assignment)
}

// handleUpdateMemberQuota updates the quota for a specific profile in a member cluster
func handleUpdateMemberQuota(c *gin.Context) {
	ctx := context.Background()
	clusterName := c.Param("clustername")
	profile := c.Param("profile")

	if profile == "" {
		common.Fail(c, fmt.Errorf("profile parameter is required"))
		return
	}

	var req quotaroutes.QuotaAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind request")
		common.Fail(c, err)
		return
	}

	// Ensure profile in path matches request body
	req.Profile = profile

	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client for member cluster", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	queueName := quotaroutes.GetQueueNameForProfile(profile)

	// Get existing queue
	existingQueue, err := dynamicClient.Resource(quotaroutes.QueueGVR).Get(ctx, queueName, metav1.GetOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			common.Fail(c, fmt.Errorf("quota not found for profile: %s in cluster: %s", profile, clusterName))
			return
		}
		klog.ErrorS(err, "Failed to get queue", "queueName", queueName, "cluster", clusterName)
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
	result, err := dynamicClient.Resource(quotaroutes.QueueGVR).Update(ctx, updatedQueue, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update queue", "profile", profile, "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	klog.InfoS("Queue updated", "profile", profile, "queueName", queueName, "cluster", clusterName)

	resources, parentQueue, usage, _ := parseQuotaFromQueue(result)

	assignment := quotaroutes.QuotaAssignment{
		Profile:     profile,
		QueueName:   queueName,
		ParentQueue: parentQueue,
		Resources:   resources,
		Usage:       usage,
		CreatedAt:   result.GetCreationTimestamp().String(),
	}

	common.Success(c, assignment)
}

// handleDeleteMemberQuota deletes the quota for a specific profile in a member cluster
func handleDeleteMemberQuota(c *gin.Context) {
	ctx := context.Background()
	clusterName := c.Param("clustername")
	profile := c.Param("profile")

	if profile == "" {
		common.Fail(c, fmt.Errorf("profile parameter is required"))
		return
	}

	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client for member cluster", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	queueName := quotaroutes.GetQueueNameForProfile(profile)

	// Check if queue exists
	_, err = dynamicClient.Resource(quotaroutes.QueueGVR).Get(ctx, queueName, metav1.GetOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			common.Fail(c, fmt.Errorf("quota not found for profile: %s in cluster: %s", profile, clusterName))
			return
		}
		klog.ErrorS(err, "Failed to get queue", "queueName", queueName, "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// Delete the Queue CR
	err = dynamicClient.Resource(quotaroutes.QueueGVR).Delete(ctx, queueName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete queue", "profile", profile, "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	klog.InfoS("Queue deleted", "profile", profile, "queueName", queueName, "cluster", clusterName)
	common.Success(c, gin.H{"message": "Quota deleted successfully"})
}

// getProfileUserMapForMember fetches Kubeflow Profile CRs from a member cluster
func getProfileUserMapForMember(ctx context.Context, clusterName string) map[string]quotaroutes.ProfileUserInfo {
	profileUserMap := make(map[string]quotaroutes.ProfileUserInfo)

	// Define the Kubeflow Profile GVR
	profileGVR := schema.GroupVersionResource{
		Group:    "kubeflow.org",
		Version:  "v1",
		Resource: "profiles",
	}

	// Try to get dynamic client for the member cluster
	dynamicClient, err := client.GetDynamicClientForMemberByContext(ctx, clusterName)
	if err != nil {
		klog.V(4).InfoS("Failed to get dynamic client for member", "cluster", clusterName, "error", err)
		return profileUserMap
	}

	// List all Profile CRs
	profiles, err := dynamicClient.Resource(profileGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		klog.V(4).InfoS("Failed to list Kubeflow Profiles", "cluster", clusterName, "error", err)
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

		profileUserMap[profileName] = quotaroutes.ProfileUserInfo{
			Username: username,
			Email:    ownerEmail,
		}
	}

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
		var f float64
		if _, err := fmt.Sscanf(v, "%f", &f); err == nil {
			return f, true
		}
	}
	return 0, false
}

// parseResourceQuota extracts resource quota from unstructured data
func parseResourceQuota(resourceData map[string]interface{}) *quotaroutes.ResourceQuota {
	if resourceData == nil {
		return nil
	}

	quota := &quotaroutes.ResourceQuota{}

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
func parseUsageFromQueue(queue *unstructured.Unstructured) *quotaroutes.QuotaUsage {
	status, found, err := unstructured.NestedMap(queue.Object, "status")
	if !found || err != nil {
		return nil
	}

	usage := &quotaroutes.QuotaUsage{}

	// Parse allocated GPU (in nano percentage, e.g., 166748087n = 0.1667)
	if allocated, found, _ := unstructured.NestedMap(status, "allocated"); found {
		if gpuVal, ok := allocated["nvidia.com/gpu"]; ok {
			switch v := gpuVal.(type) {
			case string:
				if strings.HasSuffix(v, "n") {
					var nanoVal int64
					if _, err := fmt.Sscanf(v, "%dn", &nanoVal); err == nil {
						usage.GPUAllocated = float64(nanoVal) / 1e9
					}
				} else {
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
func parseQuotaFromQueue(queue *unstructured.Unstructured) (*quotaroutes.QuotaResources, string, *quotaroutes.QuotaUsage, error) {
	spec, found, err := unstructured.NestedMap(queue.Object, "spec")
	if !found || err != nil {
		return nil, "", nil, fmt.Errorf("failed to get spec from queue")
	}

	// Get parent queue
	parentQueue, _, _ := unstructured.NestedString(spec, "parentQueue")

	resources, found, err := unstructured.NestedMap(spec, "resources")
	if !found || err != nil {
		return &quotaroutes.QuotaResources{}, parentQueue, parseUsageFromQueue(queue), nil
	}

	quotaResources := &quotaroutes.QuotaResources{}

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
func buildQueueObject(profile string, parentQueue string, resources *quotaroutes.QuotaResources) *unstructured.Unstructured {
	queueName := quotaroutes.GetQueueNameForProfile(profile)

	if parentQueue == "" {
		parentQueue = quotaroutes.DefaultParentQueue
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

// BatchCreateQuotaRequest represents a request to create quotas for multiple profiles
type BatchCreateQuotaRequest struct {
	GPUFraction float64 `json:"gpuFraction" binding:"required"`
}

// BatchCreateQuotaResponse represents the response for batch quota creation
type BatchCreateQuotaResponse struct {
	Created []string `json:"created"`
	Failed  []string `json:"failed"`
	Skipped []string `json:"skipped"`
	Total   int      `json:"total"`
}

// handleScanAndCreateMemberQuotas scans for profiles without quotas and creates them
func handleScanAndCreateMemberQuotas(c *gin.Context) {
	ctx := context.Background()
	clusterName := c.Param("clustername")

	var req BatchCreateQuotaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind request")
		common.Fail(c, err)
		return
	}

	dynamicClient, err := client.GetDynamicClientForMember(c, clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to get dynamic client for member cluster", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// Get all profiles
	profileUserMap := getProfileUserMapForMember(ctx, clusterName)

	// Get existing queues
	queues, err := dynamicClient.Resource(quotaroutes.QueueGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to list queues", "cluster", clusterName)
		common.Fail(c, err)
		return
	}

	// Build set of existing queue profiles
	existingProfiles := make(map[string]bool)
	for _, queue := range queues.Items {
		queueName := queue.GetName()
		profile := quotaroutes.GetProfileFromQueueName(queueName)
		existingProfiles[profile] = true
	}

	response := BatchCreateQuotaResponse{
		Created: []string{},
		Failed:  []string{},
		Skipped: []string{},
	}

	// Create quotas for profiles without queues
	for profile := range profileUserMap {
		if existingProfiles[profile] {
			response.Skipped = append(response.Skipped, profile)
			continue
		}

		// Build queue object with default quota
		resources := &quotaroutes.QuotaResources{
			CPU:    &quotaroutes.ResourceQuota{Quota: 0, Limit: -1},
			Memory: &quotaroutes.ResourceQuota{Quota: 0, Limit: -1},
			GPU:    &quotaroutes.ResourceQuota{Quota: req.GPUFraction, Limit: req.GPUFraction},
		}
		queue := buildQueueObject(profile, quotaroutes.DefaultParentQueue, resources)

		_, err := dynamicClient.Resource(quotaroutes.QueueGVR).Create(ctx, queue, metav1.CreateOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to create queue", "profile", profile, "cluster", clusterName)
			response.Failed = append(response.Failed, profile)
		} else {
			klog.InfoS("Queue created", "profile", profile, "cluster", clusterName)
			response.Created = append(response.Created, profile)
		}
	}

	response.Total = len(response.Created) + len(response.Failed) + len(response.Skipped)
	common.Success(c, response)
}

func init() {
	r := router.MemberV1()
	r.GET("/quota", handleGetMemberQuotas)
	r.GET("/quota/:profile", handleGetMemberQuota)
	r.POST("/quota", handleCreateMemberQuota)
	r.POST("/quota/scan-and-create", handleScanAndCreateMemberQuotas)
	r.PUT("/quota/:profile", handleUpdateMemberQuota)
	r.DELETE("/quota/:profile", handleDeleteMemberQuota)
}
