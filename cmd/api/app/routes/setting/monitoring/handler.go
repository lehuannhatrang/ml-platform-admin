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

package monitoring

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"
	"sigs.k8s.io/yaml"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
)

// generateRandomString generates a RFC 1123 subdomain-compliant random string
// The string will contain only lowercase letters and numbers, starting with a letter
func generateRandomString(length int) (string, error) {
	if length < 1 {
		return "", fmt.Errorf("length must be positive")
	}

	// Define the character sets
	const (
		letters = "abcdefghijklmnopqrstuvwxyz"
		digits  = "0123456789"
		charset = letters + digits
	)

	// Create byte slices
	result := make([]byte, length)
	randomBytes := make([]byte, length)

	// Generate random bytes
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	// First character must be a letter
	result[0] = letters[randomBytes[0]%byte(len(letters))]

	// Rest can be letters or numbers
	for i := 1; i < length; i++ {
		result[i] = charset[randomBytes[i]%byte(len(charset))]
	}

	return string(result), nil
}

type GrafanaConfig struct {
	Name     string `json:"name" binding:"required"`
	Endpoint string `json:"endpoint" binding:"required,url"`
	Token    string `json:"token" binding:"required"`
}

type MonitoringConfig struct {
	Monitorings []struct {
		Name     string `yaml:"name"`
		Type     string `yaml:"type"`
		Endpoint string `yaml:"endpoint"`
		Token    string `yaml:"token"`
	} `yaml:"monitorings"`
}

// formatLabelValue formats a string to be valid as a Kubernetes label value
// A valid label must be an empty string or consist of alphanumeric characters, '-', '_' or '.',
// and must start and end with an alphanumeric character
func formatLabelValue(value string) string {
	// Replace invalid characters with '-'
	replacer := strings.NewReplacer(" ", "-", "/", "-", "\\", "-")
	formatted := replacer.Replace(value)

	// Ensure it starts with an alphanumeric character
	if len(formatted) > 0 && !isAlphanumeric(rune(formatted[0])) {
		formatted = "x" + formatted
	}

	// Ensure it ends with an alphanumeric character
	if len(formatted) > 0 && !isAlphanumeric(rune(formatted[len(formatted)-1])) {
		formatted = formatted + "x"
	}

	return formatted
}

func isAlphanumeric(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
}

func handleAddGrafana(c *gin.Context) {
	var config GrafanaConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		common.Fail(c, fmt.Errorf("invalid request body: %w", err))
		return
	}

	// Validate input
	if strings.TrimSpace(config.Name) == "" {
		common.Fail(c, fmt.Errorf("name cannot be empty"))
		return
	}

	if strings.TrimSpace(config.Token) == "" {
		common.Fail(c, fmt.Errorf("token cannot be empty"))
		return
	}

	// Normalize endpoint URL
	config.Endpoint = strings.TrimRight(config.Endpoint, "/")

	// Get kubernetes client
	kubeClient := client.InClusterClient()

	// Generate random string for secret name
	randomStr, err := generateRandomString(16)
	if err != nil {
		klog.ErrorS(err, "Failed to generate random string")
		common.Fail(c, err)
		return
	}

	// Create secret name and validate it matches RFC 1123 subdomain format
	secretName := fmt.Sprintf("grafana-token-%s", randomStr)
	if len(secretName) > 253 || !strings.HasPrefix(secretName, "grafana-token-") {
		klog.ErrorS(nil, "Invalid secret name generated", "secretName", secretName)
		common.Fail(c, fmt.Errorf("failed to generate valid secret name"))
		return
	}

	// Format name for label
	formattedName := formatLabelValue(config.Name)

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretName,
			Namespace: "karmada-system",
			Labels: map[string]string{
				"app.kubernetes.io/name":  "grafana",
				"grafana.karmada.io/name": formattedName,
			},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"token": []byte(base64.StdEncoding.EncodeToString([]byte(config.Token))),
		},
	}

	_, err = kubeClient.CoreV1().Secrets("karmada-system").Create(c, secret, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create Grafana token secret")
		common.Fail(c, err)
		return
	}

	// Get existing configmap or create if not exists
	configMap, err := kubeClient.CoreV1().ConfigMaps("karmada-system").Get(c, "ml-platform-admin-configmap", metav1.GetOptions{})
	if err != nil {
		if !strings.Contains(err.Error(), "not found") {
			klog.ErrorS(err, "Failed to get ml-platform-admin-configmap")
			common.Fail(c, err)
			return
		}

		// Create new configmap if it doesn't exist
		configMap = &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "ml-platform-admin-configmap",
				Namespace: "karmada-system",
			},
			Data: make(map[string]string),
		}

		configMap, err = kubeClient.CoreV1().ConfigMaps("karmada-system").Create(c, configMap, metav1.CreateOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to create ml-platform-admin-configmap")
			common.Fail(c, err)
			return
		}
	}

	// Update configmap with new monitoring config
	if configMap.Data == nil {
		configMap.Data = make(map[string]string)
	}

	// Parse existing monitoring config
	var monitoringConfig MonitoringConfig
	if existingConfig, ok := configMap.Data["monitoring"]; ok && existingConfig != "" {
		if err := yaml.Unmarshal([]byte(existingConfig), &monitoringConfig); err != nil {
			klog.ErrorS(err, "Failed to parse existing monitoring config")
			common.Fail(c, err)
			return
		}

		// Check for duplicate name or endpoint
		for _, m := range monitoringConfig.Monitorings {
			if m.Name == config.Name {
				common.Fail(c, fmt.Errorf("grafana configuration with name '%s' already exists", config.Name))
				return
			}
			if strings.TrimRight(m.Endpoint, "/") == strings.TrimRight(config.Endpoint, "/") {
				common.Fail(c, fmt.Errorf("grafana configuration with endpoint '%s' already exists", config.Endpoint))
				return
			}
		}

		// Add new monitoring entry
		monitoringConfig.Monitorings = append(monitoringConfig.Monitorings, struct {
			Name     string `yaml:"name"`
			Type     string `yaml:"type"`
			Endpoint string `yaml:"endpoint"`
			Token    string `yaml:"token"`
		}{
			Name:     config.Name,
			Type:     "grafana",
			Endpoint: config.Endpoint,
			Token:    secretName,
		})
	} else {
		// Create new monitoring config
		monitoringConfig.Monitorings = []struct {
			Name     string `yaml:"name"`
			Type     string `yaml:"type"`
			Endpoint string `yaml:"endpoint"`
			Token    string `yaml:"token"`
		}{
			{
				Name:     config.Name,
				Type:     "grafana",
				Endpoint: config.Endpoint,
				Token:    secretName,
			},
		}
	}

	// Convert back to YAML
	yamlBytes, err := yaml.Marshal(monitoringConfig)
	if err != nil {
		klog.ErrorS(err, "Failed to marshal monitoring config")
		common.Fail(c, err)
		return
	}
	configMap.Data["monitoring"] = string(yamlBytes)

	_, err = kubeClient.CoreV1().ConfigMaps("karmada-system").Update(c, configMap, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update ml-platform-admin-configmap")
		common.Fail(c, err)
		return
	}

	common.Success(c, gin.H{
		"message": "Grafana configuration added successfully",
	})
}

// MonitoringResponse represents a Grafana monitoring configuration
type MonitoringResponse struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Endpoint string `json:"endpoint"`
	Token    string `json:"token,omitempty"` // omitempty to avoid exposing token in logs
}

func handleGetMonitoring(c *gin.Context) {
	// Get kubernetes client
	kubeClient := client.InClusterClient()

	// Get configmap
	configMap, err := kubeClient.CoreV1().ConfigMaps("karmada-system").Get(c, "ml-platform-admin-configmap", metav1.GetOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			common.Success(c, gin.H{"monitorings": []MonitoringResponse{}})
			return
		}
		klog.ErrorS(err, "Failed to get ml-platform-admin-configmap")
		common.Fail(c, err)
		return
	}

	// Parse monitoring config
	var monitoringConfig MonitoringConfig
	if monitoringData, ok := configMap.Data["monitoring"]; ok && monitoringData != "" {
		if err := yaml.Unmarshal([]byte(monitoringData), &monitoringConfig); err != nil {
			klog.ErrorS(err, "Failed to parse monitoring config")
			common.Fail(c, err)
			return
		}
	} else {
		common.Success(c, gin.H{"monitorings": []MonitoringResponse{}})
		return
	}

	// Get tokens from secrets
	response := make([]MonitoringResponse, 0, len(monitoringConfig.Monitorings))
	for _, monitoring := range monitoringConfig.Monitorings {
		// First add basic info without token
		monitoringResponse := MonitoringResponse{
			Name:     monitoring.Name,
			Type:     monitoring.Type,
			Endpoint: monitoring.Endpoint,
		}

		// Try to get token from secret
		secret, err := kubeClient.CoreV1().Secrets("karmada-system").Get(c, monitoring.Token, metav1.GetOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to get monitoring secret", "name", monitoring.Name, "secret", monitoring.Token)
			// Still include the monitoring entry but without token
			response = append(response, monitoringResponse)
			continue
		}

		// Decode token
		tokenBytes, ok := secret.Data["token"]
		if !ok {
			klog.ErrorS(nil, "Token not found in secret", "name", monitoring.Name, "secret", monitoring.Token)
			// Still include the monitoring entry but without token
			response = append(response, monitoringResponse)
			continue
		}

		tokenStr, err := base64.StdEncoding.DecodeString(string(tokenBytes))
		if err != nil {
			klog.ErrorS(err, "Failed to decode token", "name", monitoring.Name, "secret", monitoring.Token)
			// Still include the monitoring entry but without token
			response = append(response, monitoringResponse)
			continue
		}

		// Add token to response
		monitoringResponse.Token = string(tokenStr)
		response = append(response, monitoringResponse)
	}

	common.Success(c, gin.H{"monitorings": response})
}

// GrafanaDashboard represents a dashboard in Grafana
type GrafanaDashboard struct {
	ID          int    `json:"id"`
	UID         string `json:"uid"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	FolderID    int    `json:"folderId"`
	FolderTitle string `json:"folderTitle,omitempty"`
	Type        string `json:"type"`
}

func handleGetDashboards(c *gin.Context) {
	// Get monitoring name from path parameter
	name := c.Param("name")
	if name == "" {
		common.Fail(c, fmt.Errorf("monitoring name is required"))
		return
	}

	// Get kubernetes client
	kubeClient := client.InClusterClient()

	// Get configmap
	configMap, err := kubeClient.CoreV1().ConfigMaps("karmada-system").Get(c, "ml-platform-admin-configmap", metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ml-platform-admin-configmap")
		common.Fail(c, err)
		return
	}

	// Parse monitoring config
	var monitoringConfig MonitoringConfig
	if monitoringData, ok := configMap.Data["monitoring"]; ok && monitoringData != "" {
		if err := yaml.Unmarshal([]byte(monitoringData), &monitoringConfig); err != nil {
			klog.ErrorS(err, "Failed to parse monitoring config")
			common.Fail(c, err)
			return
		}
	} else {
		common.Fail(c, fmt.Errorf("no monitoring configuration found"))
		return
	}

	// Find the monitoring entry
	var monitoring *struct {
		Name     string `yaml:"name"`
		Type     string `yaml:"type"`
		Endpoint string `yaml:"endpoint"`
		Token    string `yaml:"token"`
	}
	for i := range monitoringConfig.Monitorings {
		if monitoringConfig.Monitorings[i].Name == name {
			monitoring = &monitoringConfig.Monitorings[i]
			break
		}
	}
	if monitoring == nil {
		common.Fail(c, fmt.Errorf("monitoring '%s' not found", name))
		return
	}

	// Check monitoring type
	if monitoring.Type != "grafana" {
		common.Fail(c, fmt.Errorf("monitoring type '%s' does not support dashboards", monitoring.Type))
		return
	}

	// Get token from secret
	secret, err := kubeClient.CoreV1().Secrets("karmada-system").Get(c, monitoring.Token, metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get monitoring secret", "name", name)
		common.Fail(c, err)
		return
	}

	// Decode token
	tokenBytes, ok := secret.Data["token"]
	if !ok {
		klog.ErrorS(nil, "Token not found in secret", "name", name)
		common.Fail(c, fmt.Errorf("token not found in secret"))
		return
	}
	tokenStr, err := base64.StdEncoding.DecodeString(string(tokenBytes))
	if err != nil {
		klog.ErrorS(err, "Failed to decode token", "name", name)
		common.Fail(c, err)
		return
	}

	// Create HTTP client
	client := &http.Client{}

	// Create request
	endpoint := strings.TrimRight(monitoring.Endpoint, "/")
	req, err := http.NewRequest("GET", fmt.Sprintf("%s/api/search?query=&type=dash-db", endpoint), nil)
	if err != nil {
		klog.ErrorS(err, "Failed to create request", "name", name)
		common.Fail(c, err)
		return
	}

	// Add headers
	req.Header.Add("Authorization", fmt.Sprintf("Bearer %s", tokenStr))

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		klog.ErrorS(err, "Failed to send request", "name", name)
		common.Fail(c, err)
		return
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		klog.ErrorS(err, "Failed to read response", "name", name)
		common.Fail(c, err)
		return
	}

	// Check response status
	if resp.StatusCode != http.StatusOK {
		klog.ErrorS(nil, "Grafana API returned error", "name", name, "status", resp.Status, "body", string(body))
		common.Fail(c, fmt.Errorf("grafana API returned error: %s", resp.Status))
		return
	}

	// Parse response
	var dashboards []GrafanaDashboard
	if err := json.Unmarshal(body, &dashboards); err != nil {
		klog.ErrorS(err, "Failed to parse response", "name", name)
		common.Fail(c, err)
		return
	}

	common.Success(c, gin.H{"dashboards": dashboards})
}

func handleDeleteMonitoring(c *gin.Context) {
	name := c.Param("name")
	endpoint := c.Query("endpoint")

	if name == "" || endpoint == "" {
		common.Fail(c, fmt.Errorf("name and endpoint parameters are required"))
		return
	}

	// Format name for label selector
	formattedName := formatLabelValue(name)

	// Get kubernetes client
	kubeClient := client.InClusterClient()

	// Get existing configmap
	configMap, err := kubeClient.CoreV1().ConfigMaps("karmada-system").Get(c, "ml-platform-admin-configmap", metav1.GetOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to get ml-platform-admin-configmap")
		common.Fail(c, err)
		return
	}

	// Parse existing monitoring config
	var monitoringConfig MonitoringConfig
	if existingConfig, ok := configMap.Data["monitoring"]; ok && existingConfig != "" {
		if err := yaml.Unmarshal([]byte(existingConfig), &monitoringConfig); err != nil {
			klog.ErrorS(err, "Failed to parse existing monitoring config")
			common.Fail(c, err)
			return
		}
	}

	// Find and remove the monitoring config
	found := false
	updatedMonitorings := make([]struct {
		Name     string `yaml:"name"`
		Type     string `yaml:"type"`
		Endpoint string `yaml:"endpoint"`
		Token    string `yaml:"token"`
	}, 0, len(monitoringConfig.Monitorings))

	for _, m := range monitoringConfig.Monitorings {
		if m.Name == name && strings.TrimRight(m.Endpoint, "/") == strings.TrimRight(endpoint, "/") {
			found = true
			continue
		}
		updatedMonitorings = append(updatedMonitorings, m)
	}

	if !found {
		common.Fail(c, fmt.Errorf("monitoring configuration with name '%s' and endpoint '%s' not found", name, endpoint))
		return
	}

	// Update configmap with new monitoring config
	monitoringConfig.Monitorings = updatedMonitorings
	monitoringYAML, err := yaml.Marshal(monitoringConfig)
	if err != nil {
		klog.ErrorS(err, "Failed to marshal monitoring config")
		common.Fail(c, err)
		return
	}

	configMap.Data["monitoring"] = string(monitoringYAML)
	_, err = kubeClient.CoreV1().ConfigMaps("karmada-system").Update(c, configMap, metav1.UpdateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to update ml-platform-admin-configmap")
		common.Fail(c, err)
		return
	}

	// List secrets to find the one associated with this monitoring config
	secrets, err := kubeClient.CoreV1().Secrets("karmada-system").List(c, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app.kubernetes.io/name=grafana,grafana.karmada.io/name=%s", formattedName),
	})
	if err != nil {
		klog.ErrorS(err, "Failed to list Grafana secrets")
		common.Fail(c, err)
		return
	}

	// Delete associated secrets
	for _, secret := range secrets.Items {
		err = kubeClient.CoreV1().Secrets("karmada-system").Delete(c, secret.Name, metav1.DeleteOptions{})
		if err != nil {
			klog.ErrorS(err, "Failed to delete Grafana secret", "secretName", secret.Name)
			common.Fail(c, err)
			return
		}
	}

	common.Success(c, gin.H{"message": "Monitoring configuration deleted successfully"})
}

func init() {
	r := router.V1()
	r.POST("/setting/monitoring/grafana", handleAddGrafana)
	r.GET("/setting/monitoring", handleGetMonitoring)
	r.GET("/setting/monitoring/:name/dashboards", handleGetDashboards)
	r.DELETE("/setting/monitoring/source/:name", handleDeleteMonitoring)
}
