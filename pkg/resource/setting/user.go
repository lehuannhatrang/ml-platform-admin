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

	"k8s.io/klog/v2"

	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/pkg/auth"
	"github.com/karmada-io/dashboard/pkg/etcd"
	"github.com/karmada-io/dashboard/pkg/auth/fga"
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

// GetUserSetting gets a user setting by username
func GetUserSetting(ctx context.Context, username string) (*v1.UserSetting, error) {
	// Get etcd client
	etcdClient, err := etcd.GetEtcdClient(nil)
	if err != nil || etcdClient == nil {
		return nil, fmt.Errorf("failed to get etcd client: %w", err)
	}

	// Generate a key for this user's settings
	userSettingKey := formatUserSettingEtcdKey(username)

	// Get from etcd
	getCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	getResp, err := etcdClient.Get(getCtx, userSettingKey)
	if err != nil {
		return nil, fmt.Errorf("failed to get user settings from etcd: %w", err)
	}

	if len(getResp.Kvs) == 0 {
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

	// Unmarshal the user setting from JSON
	userSetting := v1.UserSetting{}
	if err := json.Unmarshal(getResp.Kvs[0].Value, &userSetting); err != nil {
		return nil, fmt.Errorf("failed to unmarshal user settings: %w", err)
	}

	return &userSetting, nil
}

// CreateUserSetting creates a new user setting and also creates the user in etcd if it doesn't exist
func CreateUserSetting(ctx context.Context, userSetting v1.UserSetting) error {
	// Get etcd client
	etcdClient, err := etcd.GetEtcdClient(nil)
	if err != nil || etcdClient == nil {
		return fmt.Errorf("failed to get etcd client: %w", err)
	}

	// First, create the user in etcd
	// Check for password
	password := userSetting.Password
	
	// If password not in top level field, check preferences as fallback
	if password == "" {
		if pwd, ok := userSetting.Preferences["password"]; ok && pwd != "" {
			password = pwd
		}
	}
	
	// Validate password
	if password == "" {
		return fmt.Errorf("password is required")
	}

	// Get role from preferences or default to basic_user
	role, ok := userSetting.Preferences["role"]
	if !ok || role == "" {
		role = "basic_user"
	}

	// Get email from preferences, can be empty
	email, _ := userSetting.Preferences["email"]

	// Get displayName or use username if not provided
	displayName := userSetting.DisplayName
	if displayName == "" {
		displayName = userSetting.Username
	}
	
	// Make sure the role is valid
	if role != "admin" && role != "basic_user" {
		return fmt.Errorf("invalid role: %s", role)
	}

	// Get the user manager
	userManager := etcd.NewUserManager(etcdClient)

	// Check if the user already exists
	exists, err := userManager.UserExists(ctx, userSetting.Username)
	if err != nil {
		return fmt.Errorf("failed to check if user exists: %w", err)
	}

	// If the user doesn't exist, create it
	if !exists {
		err = userManager.CreateUser(ctx, userSetting.Username, password, email, role)
		if err != nil {
			return fmt.Errorf("failed to create user: %w", err)
		}
		klog.InfoS("User created", "username", userSetting.Username, "role", role)
	} else {
		// If the user exists, update their password and role if provided
		user, err := userManager.GetUser(ctx, userSetting.Username)
		if err != nil {
			return fmt.Errorf("failed to get user: %w", err)
		}

		// Update role if different
		needsUpdate := false
		if role != user.Role {
			user.Role = role
			needsUpdate = true
		}

		// Update email if provided and different
		if email != "" && email != user.Email {
			user.Email = email
			needsUpdate = true
		}

		// Update password
		err = userManager.UpdatePassword(ctx, userSetting.Username, password)
		if err != nil {
			return fmt.Errorf("failed to update password: %w", err)
		}

		// Update user if needed
		if needsUpdate {
			err = userManager.UpdateUser(ctx, user)
			if err != nil {
				return fmt.Errorf("failed to update user: %w", err)
			}
			klog.InfoS("User updated", "username", userSetting.Username)
		}
	}

	// Process cluster permissions with OpenFGA (if available)
	if len(userSetting.ClusterPermissions) > 0 {
		// Get FGA service
		fgaService := fga.FGAService
		if fgaService == nil {
			klog.V(4).InfoS("OpenFGA service not initialized, skipping cluster permissions", "username", userSetting.Username)
		} else {
			klog.InfoS("Setting up cluster permissions", "username", userSetting.Username, "permissions", userSetting.ClusterPermissions)
			
			// For each cluster permission
			for _, clusterPerm := range userSetting.ClusterPermissions {
				clusterName := clusterPerm.Cluster
				
				// For each role in the cluster
				for _, roleName := range clusterPerm.Roles {
					// Skip invalid roles
					if roleName != "owner" && roleName != "member" {
						klog.V(4).InfoS("Invalid cluster role, skipping", "username", userSetting.Username, "cluster", clusterName, "role", roleName)
						continue
					}
					
					// Create the relationship in OpenFGA
					err := fgaService.GetClient().WriteTuple(ctx, userSetting.Username, roleName, "cluster", clusterName)
					if err != nil {
						klog.ErrorS(err, "Failed to set cluster permission", "username", userSetting.Username, "cluster", clusterName, "role", roleName)
						// Continue anyway to avoid blocking the user creation due to permission issues
					} else {
						klog.InfoS("Added cluster permission", "username", userSetting.Username, "cluster", clusterName, "role", roleName)
					}
				}
			}
		}
	}

	// Remove password from preferences and from top-level field before storing in user settings
	// Create a copy of preferences to avoid modifying the original
	cleanedPreferences := make(map[string]string)
	for k, v := range userSetting.Preferences {
		if k != "password" {
			cleanedPreferences[k] = v
		}
	}
	userSetting.Preferences = cleanedPreferences
	
	// Clear the password field so it's not stored
	userSetting.Password = ""

	// Generate a key for this user's settings
	userSettingKey := formatUserSettingEtcdKey(userSetting.Username)

	// Serialize the user setting to JSON
	settingsData, err := json.Marshal(userSetting)
	if err != nil {
		return fmt.Errorf("failed to marshal user settings: %w", err)
	}

	// Store in etcd
	putCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err = etcdClient.Put(putCtx, userSettingKey, string(settingsData))
	if err != nil {
		return fmt.Errorf("failed to store user settings in etcd: %w", err)
	}

	klog.InfoS("User setting created", "username", userSetting.Username)
	return nil
}

// UpdateUserSetting updates a user setting and also updates the user in etcd if needed
func UpdateUserSetting(ctx context.Context, userSetting v1.UserSetting) error {
	// Get etcd client
	etcdClient, err := etcd.GetEtcdClient(nil)
	if err != nil || etcdClient == nil {
		return fmt.Errorf("failed to get etcd client: %w", err)
	}

	// Check if we need to update the user in etcd (password, role, email, etc.)
	userManager := etcd.NewUserManager(etcdClient)
	
	// Get the user from etcd
	user, err := userManager.GetUser(ctx, userSetting.Username)
	if err != nil {
		return fmt.Errorf("failed to get user from etcd: %w", err)
	}
	
	// Check for password
	password := userSetting.Password
	
	// If password not in top level field, check preferences as fallback
	if password == "" {
		if pwd, ok := userSetting.Preferences["password"]; ok && pwd != "" {
			password = pwd
		}
	}
	
	// Extract relevant fields from preferences
	role, hasRole := userSetting.Preferences["role"]
	email, hasEmail := userSetting.Preferences["email"]
	
	// Check if we need to update any user fields
	needsUpdate := false
	
	// Only update if we have the value and it's different
	if hasRole && role != "" && role != user.Role {
		// Make sure the role is valid
		if role != "admin" && role != "basic_user" {
			return fmt.Errorf("invalid role: %s", role)
		}
		user.Role = role
		needsUpdate = true
	}
	
	if hasEmail && email != user.Email {
		user.Email = email
		needsUpdate = true
	}
	
	// If there's a password, update it
	if password != "" {
		err = userManager.UpdatePassword(ctx, userSetting.Username, password)
		if err != nil {
			return fmt.Errorf("failed to update password: %w", err)
		}
		klog.InfoS("Password updated for user", "username", userSetting.Username)
	}
	
	// Update the user in etcd if needed
	if needsUpdate {
		err = userManager.UpdateUser(ctx, user)
		if err != nil {
			return fmt.Errorf("failed to update user in etcd: %w", err)
		}
		klog.InfoS("User updated in etcd", "username", userSetting.Username)
	}

	// Process cluster permissions with OpenFGA (if available)
	if len(userSetting.ClusterPermissions) > 0 {
		// Get FGA service
		fgaService := fga.FGAService
		if fgaService == nil {
			klog.V(4).InfoS("OpenFGA service not initialized, skipping cluster permissions", "username", userSetting.Username)
		} else {
			klog.InfoS("Updating cluster permissions", "username", userSetting.Username, "permissions", userSetting.ClusterPermissions)
			
			// For each cluster permission
			for _, clusterPerm := range userSetting.ClusterPermissions {
				clusterName := clusterPerm.Cluster
				
				// For each role in the cluster
				for _, roleName := range clusterPerm.Roles {
					// Skip invalid roles
					if roleName != "owner" && roleName != "member" {
						klog.V(4).InfoS("Invalid cluster role, skipping", "username", userSetting.Username, "cluster", clusterName, "role", roleName)
						continue
					}
					
					// Create the relationship in OpenFGA
					err := fgaService.GetClient().WriteTuple(ctx, userSetting.Username, roleName, "cluster", clusterName)
					if err != nil {
						klog.ErrorS(err, "Failed to update cluster permission", "username", userSetting.Username, "cluster", clusterName, "role", roleName)
						// Continue anyway to avoid blocking the user update due to permission issues
					} else {
						klog.InfoS("Updated cluster permission", "username", userSetting.Username, "cluster", clusterName, "role", roleName)
					}
				}
			}
		}
	}

	// Remove password from preferences and from top-level field before storing in user settings
	// Create a copy of preferences to avoid modifying the original
	cleanedPreferences := make(map[string]string)
	for k, v := range userSetting.Preferences {
		if k != "password" {
			cleanedPreferences[k] = v
		}
	}
	userSetting.Preferences = cleanedPreferences
	
	// Clear the password field so it's not stored
	userSetting.Password = ""

	// Check if the user setting exists
	userSettingKey := formatUserSettingEtcdKey(userSetting.Username)
	getCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	getResp, err := etcdClient.Get(getCtx, userSettingKey)
	if err != nil {
		return fmt.Errorf("failed to check if user setting exists: %w", err)
	}

	if len(getResp.Kvs) == 0 {
		return fmt.Errorf("user setting not found for %s", userSetting.Username)
	}

	// Serialize the user setting to JSON
	settingsData, err := json.Marshal(userSetting)
	if err != nil {
		return fmt.Errorf("failed to marshal user settings: %w", err)
	}

	// Store in etcd
	putCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err = etcdClient.Put(putCtx, userSettingKey, string(settingsData))
	if err != nil {
		return fmt.Errorf("failed to update user settings in etcd: %w", err)
	}

	klog.InfoS("User setting updated", "username", userSetting.Username)
	return nil
}

// DeleteUserSetting deletes a user setting and also deletes the user from etcd
func DeleteUserSetting(ctx context.Context, username string) error {
	// Get etcd client
	etcdClient, err := etcd.GetEtcdClient(nil)
	if err != nil || etcdClient == nil {
		return fmt.Errorf("failed to get etcd client: %w", err)
	}

	// First delete the user settings
	userSettingKey := formatUserSettingEtcdKey(username)
	deleteCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	delResp, err := etcdClient.Delete(deleteCtx, userSettingKey)
	if err != nil {
		return fmt.Errorf("failed to delete user settings from etcd: %w", err)
	}

	if delResp.Deleted == 0 {
		klog.InfoS("User setting not found, only deleting user", "username", username)
	} else {
		klog.InfoS("User setting deleted", "username", username)
	}

	// Now delete the user from etcd
	userManager := etcd.NewUserManager(etcdClient)
	err = userManager.DeleteUser(ctx, username)
	if err != nil {
		return fmt.Errorf("failed to delete user from etcd: %w", err)
	}

	klog.InfoS("User deleted from etcd", "username", username)
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

	var userSettings []v1.UserSetting

	for _, etcdUser := range etcdUsers {
		// For each user in etcd, try to get their settings from etcd
		userSetting, err := GetUserSetting(ctx, etcdUser.Username)
		if err != nil {
			klog.ErrorS(err, "Failed to get user settings", "username", etcdUser.Username)
			continue
		}

		// Add etcd user information to the preferences if it doesn't already exist
		if userSetting.Preferences == nil {
			userSetting.Preferences = make(map[string]string)
		}
		
		// Add role and email from etcd if available
		userSetting.Preferences["role"] = etcdUser.Role
		if etcdUser.Email != "" {
			userSetting.Preferences["email"] = etcdUser.Email
		}
		
		// Use email as display name if not already set
		if userSetting.DisplayName == "" && etcdUser.Email != "" {
			userSetting.DisplayName = etcdUser.Email
		}
		
		userSettings = append(userSettings, *userSetting)
	}

	return userSettings, nil
}

// formatUserSettingEtcdKey formats a key for storing user settings in etcd
func formatUserSettingEtcdKey(username string) string {
	return fmt.Sprintf("usersettings/%s", username)
}
