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

package cloudcredentials

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	pkgerrors "github.com/karmada-io/dashboard/pkg/common/errors"
)

const (
	CloudCredentialsNamespace = "ml-platform-system"
	CredentialLabelKey        = "ml-platform.io/credential-type"
	ProviderLabelKey          = "ml-platform.io/cloud-provider"
)

type CloudCredential struct {
	Name         string            `json:"name"`
	Provider     string            `json:"provider"`
	Description  string            `json:"description,omitempty"`
	CreatedAt    string            `json:"createdAt"`
	Labels       map[string]string `json:"labels,omitempty"`
}

type CloudCredentialList struct {
	Credentials []CloudCredential `json:"credentials"`
	TotalItems  int               `json:"totalItems"`
}

type CreateCredentialRequest struct {
	Name        string `json:"name" binding:"required"`
	Provider    string `json:"provider" binding:"required"`
	Credentials string `json:"credentials" binding:"required"`
	Description string `json:"description"`
}

type UpdateCredentialRequest struct {
	Credentials string `json:"credentials"`
	Description string `json:"description"`
}

// handleGetCloudCredentials returns a list of cloud credentials
func handleGetCloudCredentials(c *gin.Context) {
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, pkgerrors.NewInternal("Failed to get management cluster client"))
		return
	}

	// List secrets with the credential label
	secrets, err := k8sClient.CoreV1().Secrets(CloudCredentialsNamespace).List(context.TODO(), metav1.ListOptions{
		LabelSelector: CredentialLabelKey + "=cloud-credential",
	})
	if err != nil {
		klog.ErrorS(err, "Failed to list cloud credentials")
		common.Fail(c, err)
		return
	}

	credentials := make([]CloudCredential, 0, len(secrets.Items))
	for _, secret := range secrets.Items {
		cred := CloudCredential{
			Name:        secret.Name,
			Provider:    secret.Labels[ProviderLabelKey],
			Description: secret.Annotations["description"],
			CreatedAt:   secret.CreationTimestamp.Format("2006-01-02 15:04:05"),
			Labels:      secret.Labels,
		}
		credentials = append(credentials, cred)
	}

	result := CloudCredentialList{
		Credentials: credentials,
		TotalItems:  len(credentials),
	}

	common.Success(c, result)
}

// handleGetCloudCredential returns a specific cloud credential detail
func handleGetCloudCredential(c *gin.Context) {
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, pkgerrors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")
	secret, err := k8sClient.CoreV1().Secrets(CloudCredentialsNamespace).Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			common.Fail(c, pkgerrors.NewNotFound("Cloud credential not found"))
			return
		}
		klog.ErrorS(err, "Failed to get cloud credential", "name", name)
		common.Fail(c, err)
		return
	}

	// Check if it's a cloud credential secret
	if secret.Labels[CredentialLabelKey] != "cloud-credential" {
		common.Fail(c, pkgerrors.NewNotFound("Cloud credential not found"))
		return
	}

	cred := CloudCredential{
		Name:        secret.Name,
		Provider:    secret.Labels[ProviderLabelKey],
		Description: secret.Annotations["description"],
		CreatedAt:   secret.CreationTimestamp.Format("2006-01-02 15:04:05"),
		Labels:      secret.Labels,
	}

	common.Success(c, cred)
}

// handleCreateCloudCredential creates a new cloud credential
func handleCreateCloudCredential(c *gin.Context) {
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, pkgerrors.NewInternal("Failed to get management cluster client"))
		return
	}

	var req CreateCredentialRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind JSON for credential creation")
		common.Fail(c, pkgerrors.NewBadRequest(err.Error()))
		return
	}

	// Validate provider
	validProviders := []string{"aws", "gcp", "azure", "openstack", "vsphere"}
	isValidProvider := false
	for _, provider := range validProviders {
		if strings.EqualFold(req.Provider, provider) {
			isValidProvider = true
			break
		}
	}
	if !isValidProvider {
		common.Fail(c, pkgerrors.NewBadRequest(fmt.Sprintf("Invalid provider: %s. Valid providers: %v", req.Provider, validProviders)))
		return
	}

	// Create secret
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      req.Name,
			Namespace: CloudCredentialsNamespace,
			Labels: map[string]string{
				CredentialLabelKey: "cloud-credential",
				ProviderLabelKey:   strings.ToLower(req.Provider),
			},
			Annotations: map[string]string{
				"description": req.Description,
			},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"credentials": []byte(req.Credentials),
		},
	}

	createdSecret, err := k8sClient.CoreV1().Secrets(CloudCredentialsNamespace).Create(context.TODO(), secret, metav1.CreateOptions{})
	if err != nil {
		if apierrors.IsAlreadyExists(err) {
			common.Fail(c, pkgerrors.NewBadRequest(fmt.Sprintf("Cloud credential with name '%s' already exists", req.Name)))
			return
		}
		klog.ErrorS(err, "Failed to create cloud credential", "name", req.Name)
		common.Fail(c, err)
		return
	}

	cred := CloudCredential{
		Name:        createdSecret.Name,
		Provider:    createdSecret.Labels[ProviderLabelKey],
		Description: createdSecret.Annotations["description"],
		CreatedAt:   createdSecret.CreationTimestamp.Format("2006-01-02 15:04:05"),
		Labels:      createdSecret.Labels,
	}

	common.Success(c, cred)
}

// handleUpdateCloudCredential updates an existing cloud credential
func handleUpdateCloudCredential(c *gin.Context) {
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, pkgerrors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")
	var req UpdateCredentialRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		klog.ErrorS(err, "Failed to bind JSON for credential update")
		common.Fail(c, pkgerrors.NewBadRequest(err.Error()))
		return
	}

	// Get existing secret
	secret, err := k8sClient.CoreV1().Secrets(CloudCredentialsNamespace).Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			common.Fail(c, pkgerrors.NewNotFound("Cloud credential not found"))
			return
		}
		klog.ErrorS(err, "Failed to get cloud credential", "name", name)
		common.Fail(c, err)
		return
	}

	// Check if it's a cloud credential secret
	if secret.Labels[CredentialLabelKey] != "cloud-credential" {
		common.Fail(c, pkgerrors.NewNotFound("Cloud credential not found"))
		return
	}

	// Update secret data
	if req.Credentials != "" {
		secret.Data["credentials"] = []byte(req.Credentials)
	}
	if req.Description != "" {
		if secret.Annotations == nil {
			secret.Annotations = make(map[string]string)
		}
		secret.Annotations["description"] = req.Description
	}

	updatedSecret, err := k8sClient.CoreV1().Secrets(CloudCredentialsNamespace).Update(context.TODO(), secret, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update cloud credential", "name", name)
		common.Fail(c, err)
		return
	}

	cred := CloudCredential{
		Name:        updatedSecret.Name,
		Provider:    updatedSecret.Labels[ProviderLabelKey],
		Description: updatedSecret.Annotations["description"],
		CreatedAt:   updatedSecret.CreationTimestamp.Format("2006-01-02 15:04:05"),
		Labels:      updatedSecret.Labels,
	}

	common.Success(c, cred)
}

// handleDeleteCloudCredential deletes a cloud credential
func handleDeleteCloudCredential(c *gin.Context) {
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, pkgerrors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")

	// Verify it exists and is a cloud credential
	secret, err := k8sClient.CoreV1().Secrets(CloudCredentialsNamespace).Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			common.Fail(c, pkgerrors.NewNotFound("Cloud credential not found"))
			return
		}
		klog.ErrorS(err, "Failed to get cloud credential", "name", name)
		common.Fail(c, err)
		return
	}

	// Check if it's a cloud credential secret
	if secret.Labels[CredentialLabelKey] != "cloud-credential" {
		common.Fail(c, pkgerrors.NewNotFound("Cloud credential not found"))
		return
	}

	err = k8sClient.CoreV1().Secrets(CloudCredentialsNamespace).Delete(context.TODO(), name, metav1.DeleteOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to delete cloud credential", "name", name)
		common.Fail(c, err)
		return
	}

	common.Success(c, gin.H{"message": "Cloud credential deleted successfully"})
}

// handleGetCredentialContent returns the actual credential content (for editing)
func handleGetCredentialContent(c *gin.Context) {
	k8sClient := client.InClusterClient()
	if k8sClient == nil {
		klog.Error("Failed to get management cluster client")
		common.Fail(c, pkgerrors.NewInternal("Failed to get management cluster client"))
		return
	}

	name := c.Param("name")
	secret, err := k8sClient.CoreV1().Secrets(CloudCredentialsNamespace).Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			common.Fail(c, pkgerrors.NewNotFound("Cloud credential not found"))
			return
		}
		klog.ErrorS(err, "Failed to get cloud credential", "name", name)
		common.Fail(c, err)
		return
	}

	// Check if it's a cloud credential secret
	if secret.Labels[CredentialLabelKey] != "cloud-credential" {
		common.Fail(c, pkgerrors.NewNotFound("Cloud credential not found"))
		return
	}

	// Return credential content (base64 encoded for security)
	credContent := base64.StdEncoding.EncodeToString(secret.Data["credentials"])

	common.Success(c, gin.H{
		"name":        secret.Name,
		"provider":    secret.Labels[ProviderLabelKey],
		"credentials": credContent,
		"description": secret.Annotations["description"],
	})
}

func init() {
	r := router.V1()
	r.GET("/cloudcredentials", handleGetCloudCredentials)
	r.GET("/cloudcredentials/:name", handleGetCloudCredential)
	r.GET("/cloudcredentials/:name/content", handleGetCredentialContent)
	r.POST("/cloudcredentials", handleCreateCloudCredential)
	r.PUT("/cloudcredentials/:name", handleUpdateCloudCredential)
	r.DELETE("/cloudcredentials/:name", handleDeleteCloudCredential)
}




