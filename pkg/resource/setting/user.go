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

package setting

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/auth"
)

const (
	// UserSettingsNamespace is the namespace where user settings are stored
	UserSettingsNamespace = "karmada-dashboard"

	// UserSettingsLabelKey is the label key for user settings
	UserSettingsLabelKey = "app.kubernetes.io/managed-by"

	// UserSettingsLabelValue is the label value for user settings
	UserSettingsLabelValue = "karmada-dashboard"

	// UserSettingsType is the type annotation for user settings
	UserSettingsType = "user-settings"

	// UserSettingsKey is the key in the configmap data that stores the settings
	UserSettingsKey = "settings.json"
)

// GetUserSetting retrieves the user setting for a specific user
func GetUserSetting(ctx context.Context, username string) (*v1.UserSetting, error) {
	karmadaClient := client.InClusterClient()
	configMapName := formatUserSettingConfigMapName(username)

	configMap, err := karmadaClient.CoreV1().ConfigMaps(UserSettingsNamespace).Get(ctx, configMapName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			// Return an empty user setting with default values if none exists
			return &v1.UserSetting{
				Username:    username,
				Theme:       "light",
				Language:    "en",
				DateFormat:  "MM/DD/YYYY",
				TimeFormat:  "12h",
				Preferences: make(map[string]string),
				Dashboard: &v1.DashboardSettings{
					DefaultView:     "clusters",
					RefreshInterval: 30,
				},
			}, nil
		}
		return nil, err
	}

	settingsData, exists := configMap.Data[UserSettingsKey]
	if !exists {
		return nil, fmt.Errorf("user settings data not found in ConfigMap")
	}

	var userSetting v1.UserSetting
	if err := json.Unmarshal([]byte(settingsData), &userSetting); err != nil {
		return nil, fmt.Errorf("failed to unmarshal user settings: %w", err)
	}

	return &userSetting, nil
}

// CreateUserSetting creates a new user setting
func CreateUserSetting(ctx context.Context, userSetting v1.UserSetting) error {
	karmadaClient := client.InClusterClient()
	configMapName := formatUserSettingConfigMapName(userSetting.Username)

	// Check if the user setting already exists
	_, err := karmadaClient.CoreV1().ConfigMaps(UserSettingsNamespace).Get(ctx, configMapName, metav1.GetOptions{})
	if err == nil {
		return fmt.Errorf("user setting already exists for %s", userSetting.Username)
	}
	if !apierrors.IsNotFound(err) {
		return err
	}

	// Serialize the user setting to JSON
	settingsData, err := json.Marshal(userSetting)
	if err != nil {
		return fmt.Errorf("failed to marshal user settings: %w", err)
	}

	// Create a ConfigMap to store the user setting
	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      configMapName,
			Namespace: UserSettingsNamespace,
			Labels: map[string]string{
				UserSettingsLabelKey: UserSettingsLabelValue,
			},
			Annotations: map[string]string{
				"type":     UserSettingsType,
				"username": userSetting.Username,
			},
		},
		Data: map[string]string{
			UserSettingsKey: string(settingsData),
		},
	}

	_, err = karmadaClient.CoreV1().ConfigMaps(UserSettingsNamespace).Create(ctx, configMap, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create user setting: %w", err)
	}

	klog.InfoS("Created user setting", "username", userSetting.Username)
	return nil
}

// UpdateUserSetting updates an existing user setting
func UpdateUserSetting(ctx context.Context, userSetting v1.UserSetting) error {
	karmadaClient := client.InClusterClient()
	configMapName := formatUserSettingConfigMapName(userSetting.Username)

	// Get the existing ConfigMap
	configMap, err := karmadaClient.CoreV1().ConfigMaps(UserSettingsNamespace).Get(ctx, configMapName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			// If it doesn't exist, create it instead
			return CreateUserSetting(ctx, userSetting)
		}
		return err
	}

	// Serialize the user setting to JSON
	settingsData, err := json.Marshal(userSetting)
	if err != nil {
		return fmt.Errorf("failed to marshal user settings: %w", err)
	}

	// Update the ConfigMap
	if configMap.Data == nil {
		configMap.Data = map[string]string{}
	}
	configMap.Data[UserSettingsKey] = string(settingsData)

	_, err = karmadaClient.CoreV1().ConfigMaps(UserSettingsNamespace).Update(ctx, configMap, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update user setting: %w", err)
	}

	klog.InfoS("Updated user setting", "username", userSetting.Username)
	return nil
}

// DeleteUserSetting deletes a user setting
func DeleteUserSetting(ctx context.Context, username string) error {
	karmadaClient := client.InClusterClient()
	configMapName := formatUserSettingConfigMapName(username)

	err := karmadaClient.CoreV1().ConfigMaps(UserSettingsNamespace).Delete(ctx, configMapName, metav1.DeleteOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			// Already deleted, return success
			return nil
		}
		return fmt.Errorf("failed to delete user setting: %w", err)
	}

	klog.InfoS("Deleted user setting", "username", username)
	return nil
}

// GetAllUsers retrieves a list of all users with settings in the system
func GetAllUsers(ctx context.Context) ([]v1.UserSetting, error) {
	// Get users from etcd
	userManager := auth.GetUserManager()
	if userManager == nil {
		return nil, fmt.Errorf("user manager not initialized")
	}

	// List all users from etcd
	etcdUsers, err := userManager.ListUsers(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list users from etcd: %w", err)
	}

	// Get settings for each user from ConfigMaps
	karmadaClient := client.InClusterClient()
	var userSettings []v1.UserSetting

	for _, etcdUser := range etcdUsers {
		// For each user in etcd, try to get their settings from ConfigMap
		configMapName := formatUserSettingConfigMapName(etcdUser.Username)
		configMap, err := karmadaClient.CoreV1().ConfigMaps(UserSettingsNamespace).Get(ctx, configMapName, metav1.GetOptions{})
		
		if err != nil {
			if !apierrors.IsNotFound(err) {
				klog.ErrorS(err, "Failed to get user settings", "username", etcdUser.Username)
			}
			// Create a basic user setting with just the username and data from etcd
			userSetting := v1.UserSetting{
				Username: etcdUser.Username,
				// Use email as display name if available
				DisplayName: etcdUser.Email,
				Preferences: map[string]string{
					"role":      etcdUser.Role,
					"email":     etcdUser.Email,
					"fromEtcd":  "true",
				},
			}
			
			// Only add timestamps if they are valid
			if !etcdUser.CreatedAt.IsZero() {
				userSetting.Preferences["createdAt"] = etcdUser.CreatedAt.Format(time.RFC3339)
			}
			if !etcdUser.UpdatedAt.IsZero() {
				userSetting.Preferences["updatedAt"] = etcdUser.UpdatedAt.Format(time.RFC3339)
			}
			
			userSettings = append(userSettings, userSetting)
			continue
		}

		// Check if it's a user settings ConfigMap
		if configMap.Annotations["type"] != UserSettingsType {
			continue
		}

		// Parse the settings from the ConfigMap
		settingStr, exists := configMap.Data["settings"]
		if !exists {
			continue
		}

		var setting v1.UserSetting
		if err := json.Unmarshal([]byte(settingStr), &setting); err != nil {
			klog.ErrorS(err, "Failed to unmarshal user settings", "username", etcdUser.Username)
			continue
		}

		// Make sure the username from etcd is used (in case the ConfigMap has a different one)
		setting.Username = etcdUser.Username
		
		// Add etcd user information to the preferences if it doesn't already exist
		if setting.Preferences == nil {
			setting.Preferences = make(map[string]string)
		}
		
		// Add role and email from etcd if available
		setting.Preferences["role"] = etcdUser.Role
		if etcdUser.Email != "" {
			setting.Preferences["email"] = etcdUser.Email
		}
		
		// Use email as display name if not already set
		if setting.DisplayName == "" && etcdUser.Email != "" {
			setting.DisplayName = etcdUser.Email
		}
		
		userSettings = append(userSettings, setting)
	}

	return userSettings, nil
}

// formatUserSettingConfigMapName creates a consistent ConfigMap name for user settings
func formatUserSettingConfigMapName(username string) string {
	return fmt.Sprintf("user-settings-%s", username)
}
