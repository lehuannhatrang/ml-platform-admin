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
	"encoding/base64"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	policyv1alpha1 "github.com/karmada-io/karmada/pkg/apis/policy/v1alpha1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
)

// RegistryCredentials represents registry authentication information
type RegistryCredentials struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Registry        string `json:"registry"`
	Username        string `json:"username"`
	Password        string `json:"password,omitempty"`
	Description     string `json:"description"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
	SecretName      string `json:"secretName"`
	SecretNamespace string `json:"secretNamespace"`
}

// CreateRegistryRequest represents the request to create a new registry
type CreateRegistryRequest struct {
	Name        string `json:"name" binding:"required"`
	Registry    string `json:"registry" binding:"required"`
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password" binding:"required"`
	Description string `json:"description"`
}

// UpdateRegistryRequest represents the request to update a registry
type UpdateRegistryRequest struct {
	Name        string `json:"name"`
	Registry    string `json:"registry"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	Description string `json:"description"`
}

const (
	registrySecretPrefix = "backup-registry"
	registryNamespace    = "stateful-migration"
)

// convertSecretToUnstructured converts a Secret object to unstructured
func convertSecretToUnstructured(secret *corev1.Secret) (*unstructured.Unstructured, error) {
	obj := &unstructured.Unstructured{}
	obj.SetAPIVersion("v1")
	obj.SetKind("Secret")
	obj.SetName(secret.Name)
	obj.SetNamespace(secret.Namespace)
	obj.SetLabels(secret.Labels)
	obj.SetAnnotations(secret.Annotations)

	// Set data - Kubernetes expects base64 encoded data
	if secret.Data != nil {
		data := make(map[string]interface{})
		for k, v := range secret.Data {
			data[k] = base64.StdEncoding.EncodeToString(v)
		}
		obj.Object["data"] = data
	}

	// Set type
	obj.Object["type"] = string(secret.Type)

	return obj, nil
}

// handleGetRegistries retrieves all registry configurations
func handleGetRegistries(c *gin.Context) {
	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get Karmada dynamic client")
		common.Fail(c, err)
		return
	}

	// List all secrets with registry prefix from Karmada
	secretGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "secrets",
	}

	secretsUnstructured, err := karmadaDynamicClient.Resource(secretGVR).Namespace(registryNamespace).List(context.TODO(), metav1.ListOptions{
		LabelSelector: "app=backup-registry",
	})
	if err != nil {
		klog.ErrorS(err, "Failed to list registry secrets from Karmada")
		common.Fail(c, err)
		return
	}

	registries := make([]RegistryCredentials, 0, len(secretsUnstructured.Items))
	for _, secretUnstructured := range secretsUnstructured.Items {
		secret := &corev1.Secret{}
		err := convertUnstructuredToTyped(&secretUnstructured, secret)
		if err != nil {
			klog.ErrorS(err, "Failed to convert secret", "secretName", secretUnstructured.GetName())
			continue
		}
		registry := secretToRegistry(secret)
		registries = append(registries, registry)
	}

	common.Success(c, map[string]interface{}{
		"registries": registries,
		"total":      len(registries),
	})
}

// handleGetRegistry retrieves a specific registry configuration
func handleGetRegistry(c *gin.Context) {
	registryID := c.Param("id")
	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get Karmada dynamic client")
		common.Fail(c, err)
		return
	}

	secretName := fmt.Sprintf("%s-%s", registrySecretPrefix, registryID)
	secretGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "secrets",
	}

	secretUnstructured, err := karmadaDynamicClient.Resource(secretGVR).Namespace(registryNamespace).Get(context.TODO(), secretName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get registry secret from Karmada", "registryID", registryID)
		common.Fail(c, err)
		return
	}

	secret := &corev1.Secret{}
	err = convertUnstructuredToTyped(secretUnstructured, secret)
	if err != nil {
		klog.ErrorS(err, "Failed to convert secret", "secretName", secretName)
		common.Fail(c, err)
		return
	}

	registry := secretToRegistry(secret)
	common.Success(c, registry)
}

// handleCreateRegistry creates a new registry configuration
func handleCreateRegistry(c *gin.Context) {
	var req CreateRegistryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind registry request")
		common.Fail(c, err)
		return
	}

	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get Karmada dynamic client")
		common.Fail(c, err)
		return
	}

	// Generate unique ID for the registry
	registryID := generateRegistryID(req.Name)
	secretName := fmt.Sprintf("%s-%s", registrySecretPrefix, registryID)

	// Create secret data
	secretData := map[string][]byte{
		"name":        []byte(req.Name),
		"registry":    []byte(req.Registry),
		"username":    []byte(req.Username),
		"password":    []byte(req.Password),
		"description": []byte(req.Description),
	}

	// Create secret object
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretName,
			Namespace: registryNamespace,
			Labels: map[string]string{
				"app":           "backup-registry",
				"registry-id":   registryID,
				"registry-name": req.Name,
			},
			Annotations: map[string]string{
				"backup.dcnlab.com/created-at": metav1.Now().Format(time.RFC3339),
			},
		},
		Data: secretData,
		Type: corev1.SecretTypeOpaque,
	}

	// Convert secret to unstructured and create in Karmada
	secretUnstructured, err := convertSecretToUnstructured(secret)
	if err != nil {
		klog.ErrorS(err, "Failed to convert secret to unstructured")
		common.Fail(c, err)
		return
	}

	secretGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "secrets",
	}

	_, err = karmadaDynamicClient.Resource(secretGVR).Namespace(registryNamespace).Create(context.TODO(), secretUnstructured, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create registry secret in Karmada")
		common.Fail(c, err)
		return
	}

	// Propagate secret to member clusters using PropagationPolicy
	if err := propagateRegistrySecret(registryID, secretName, registryNamespace); err != nil {
		klog.ErrorS(err, "Failed to propagate registry secret", "secretName", secretName)
		// Continue even if propagation fails - we can retry later
	}

	registry := secretToRegistry(secret)
	common.Success(c, registry)
}

// handleUpdateRegistry updates an existing registry configuration
func handleUpdateRegistry(c *gin.Context) {
	registryID := c.Param("id")
	var req UpdateRegistryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind registry update request")
		common.Fail(c, err)
		return
	}

	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get Karmada dynamic client")
		common.Fail(c, err)
		return
	}

	secretName := fmt.Sprintf("%s-%s", registrySecretPrefix, registryID)
	secretGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "secrets",
	}

	// Get existing secret from Karmada
	secretUnstructured, err := karmadaDynamicClient.Resource(secretGVR).Namespace(registryNamespace).Get(context.TODO(), secretName, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get registry secret for update from Karmada", "registryID", registryID)
		common.Fail(c, err)
		return
	}

	secret := &corev1.Secret{}
	err = convertUnstructuredToTyped(secretUnstructured, secret)
	if err != nil {
		klog.ErrorS(err, "Failed to convert secret", "secretName", secretName)
		common.Fail(c, err)
		return
	}

	// Update secret data
	if req.Name != "" {
		secret.Data["name"] = []byte(req.Name)
		secret.Labels["registry-name"] = req.Name
	}
	if req.Registry != "" {
		secret.Data["registry"] = []byte(req.Registry)
	}
	if req.Username != "" {
		secret.Data["username"] = []byte(req.Username)
	}
	if req.Password != "" {
		secret.Data["password"] = []byte(req.Password)
	}
	if req.Description != "" {
		secret.Data["description"] = []byte(req.Description)
	}

	secret.Annotations["backup.dcnlab.com/updated-at"] = metav1.Now().Format(time.RFC3339)

	// Convert back to unstructured and update in Karmada
	updatedSecretUnstructured, err := convertSecretToUnstructured(secret)
	if err != nil {
		klog.ErrorS(err, "Failed to convert updated secret to unstructured")
		common.Fail(c, err)
		return
	}

	_, err = karmadaDynamicClient.Resource(secretGVR).Namespace(registryNamespace).Update(context.TODO(), updatedSecretUnstructured, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update registry secret in Karmada")
		common.Fail(c, err)
		return
	}

	registry := secretToRegistry(secret)
	common.Success(c, registry)
}

// handleDeleteRegistry deletes a registry configuration
func handleDeleteRegistry(c *gin.Context) {
	registryID := c.Param("id")
	karmadaDynamicClient, err := getKarmadaDynamicClient()
	if err != nil {
		klog.ErrorS(err, "Failed to get Karmada dynamic client")
		common.Fail(c, err)
		return
	}

	secretName := fmt.Sprintf("%s-%s", registrySecretPrefix, registryID)
	secretGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "secrets",
	}

	// Delete secret from Karmada
	err = karmadaDynamicClient.Resource(secretGVR).Namespace(registryNamespace).Delete(context.TODO(), secretName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete registry secret from Karmada", "registryID", registryID)
		common.Fail(c, err)
		return
	}

	// Also delete the PropagationPolicy
	karmadaClient := client.InClusterKarmadaClient()
	propagationPolicyName := fmt.Sprintf("backup-registry-%s", registryID)
	err = karmadaClient.PolicyV1alpha1().PropagationPolicies(registryNamespace).Delete(context.TODO(), propagationPolicyName, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete PropagationPolicy for registry", "registryID", registryID)
		// Continue even if PropagationPolicy deletion fails
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Registry deleted successfully",
	})
}

// secretToRegistry converts a Kubernetes secret to a RegistryCredentials struct
func secretToRegistry(secret *corev1.Secret) RegistryCredentials {
	registry := RegistryCredentials{
		ID:       secret.Labels["registry-id"],
		Name:     string(secret.Data["name"]),
		Registry: string(secret.Data["registry"]),
		Username: string(secret.Data["username"]),
		// Don't expose password in responses
		Description:     string(secret.Data["description"]),
		CreatedAt:       secret.Annotations["backup.dcnlab.com/created-at"],
		UpdatedAt:       secret.Annotations["backup.dcnlab.com/updated-at"],
		SecretName:      secret.Name,
		SecretNamespace: secret.Namespace,
	}

	if registry.CreatedAt == "" {
		registry.CreatedAt = secret.CreationTimestamp.Format(time.RFC3339)
	}
	if registry.UpdatedAt == "" {
		registry.UpdatedAt = registry.CreatedAt
	}

	return registry
}

// generateRegistryID generates a unique ID for a registry
func generateRegistryID(name string) string {
	// Simple implementation - in production you might want to use UUID
	return fmt.Sprintf("%s-%d", name, metav1.Now().Unix())
}

// propagateRegistrySecret creates a PropagationPolicy to propagate the registry secret to member clusters
func propagateRegistrySecret(registryID, secretName, namespace string) error {
	karmadaClient := client.InClusterKarmadaClient()

	klog.InfoS("Creating PropagationPolicy for registry secret", "secretName", secretName, "namespace", namespace, "registryID", registryID)

	// Get list of member clusters where backup controllers might be running
	// For now, we'll propagate to all member clusters
	memberClusters, err := getMemberClusters()
	if err != nil {
		return fmt.Errorf("failed to get member clusters: %v", err)
	}

	// Create PropagationPolicy to propagate the registry secret
	propagationPolicy := &policyv1alpha1.PropagationPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("backup-registry-%s", registryID),
			Namespace: namespace,
			Labels: map[string]string{
				"app":         "backup-registry",
				"registry-id": registryID,
			},
		},
		Spec: policyv1alpha1.PropagationSpec{
			ResourceSelectors: []policyv1alpha1.ResourceSelector{
				{
					APIVersion: "v1",
					Kind:       "Secret",
					Name:       secretName,
				},
			},
			Placement: policyv1alpha1.Placement{
				ClusterAffinity: &policyv1alpha1.ClusterAffinity{
					ClusterNames: memberClusters,
				},
			},
		},
	}

	_, err = karmadaClient.PolicyV1alpha1().PropagationPolicies(namespace).Create(context.TODO(), propagationPolicy, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create PropagationPolicy: %v", err)
	}

	klog.InfoS("Successfully created PropagationPolicy for registry secret", "propagationPolicy", propagationPolicy.Name, "clusters", memberClusters)
	return nil
}

// getMemberClusters returns a list of member cluster names
func getMemberClusters() ([]string, error) {
	// Get all clusters from Karmada
	karmadaClient := client.InClusterKarmadaClient()

	clusterList, err := karmadaClient.ClusterV1alpha1().Clusters().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list clusters: %v", err)
	}

	memberClusters := make([]string, 0, len(clusterList.Items))
	for _, cluster := range clusterList.Items {
		// Skip management cluster if it's in the list
		if cluster.Name != "mgmt-cluster" && cluster.Name != "management" {
			memberClusters = append(memberClusters, cluster.Name)
		}
	}

	return memberClusters, nil
}

// Register routes
func init() {
	r := router.V1()

	// Registry management routes
	registryGroup := r.Group("/backup/registry")
	{
		registryGroup.GET("", handleGetRegistries)
		registryGroup.POST("", handleCreateRegistry)
		registryGroup.GET("/:id", handleGetRegistry)
		registryGroup.PUT("/:id", handleUpdateRegistry)
		registryGroup.DELETE("/:id", handleDeleteRegistry)
	}
}
