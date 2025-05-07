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

package cluster

import (
	"context"
	"fmt"

	karmadaclientset "github.com/karmada-io/karmada/pkg/generated/clientset/versioned"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/pkg/auth/fga"
	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/etcd"
)

// ClusterUser represents a user with access to a cluster and their roles.
type ClusterUser struct {
	Username    string   `json:"username"`
	DisplayName string   `json:"displayName"`
	Email       string   `json:"email,omitempty"`
	Roles       []string `json:"roles"`
}

// ClusterUserList represents a list of users with access to a specific cluster.
type ClusterUserList struct {
	Users  []ClusterUser `json:"users"`
	Errors []error       `json:"errors"`
}

// GetClusterUsers returns a list of users that have access to the specified cluster.
func GetClusterUsers(client karmadaclientset.Interface, clusterName string) (*ClusterUserList, error) {
	// Handle nil client to prevent panic
	if client == nil {
		return nil, fmt.Errorf("karmada client is nil")
	}

	// First, check if the cluster exists
	_, err := client.ClusterV1alpha1().Clusters().Get(context.TODO(), clusterName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get cluster %s: %w", clusterName, err)
	}

	// Initialize user list
	userList := &ClusterUserList{
		Users: []ClusterUser{},
	}

	// Get the FGA service
	fgaService := fga.FGAService
	if fgaService == nil {
		klog.V(4).InfoS("OpenFGA service not initialized", "cluster", clusterName)
		return userList, nil
	}

	// Create etcd client options
	etcdOpts := etcd.NewDefaultOptions()
	
	// Get etcd client
	etcdClient, err := etcd.GetEtcdClient(etcdOpts)
	if err != nil {
		klog.ErrorS(err, "Failed to get etcd client")
		return userList, nil
	}
	
	// Create user manager to retrieve user information
	userManager := etcd.NewUserManager(etcdClient)
	
	// Map to store user data by username
	userMap := make(map[string]*ClusterUser)
	
	// First, check if there are users with system admin role (admin on dashboard)
	// System admins have access to all clusters
	adminUsers, err := getUsersWithRole(fgaService, "admin", "dashboard", "dashboard", userManager)
	if err != nil {
		nonCriticalErrors, criticalError := errors.ExtractErrors(err)
		if criticalError != nil {
			return nil, criticalError
		}
		userList.Errors = append(userList.Errors, nonCriticalErrors...)
	}

	// Add admin users to the map
	for _, username := range adminUsers {
		// Get user details
		userInfo, err := userManager.GetUser(context.Background(), username)
		if err != nil {
			klog.ErrorS(err, "Failed to get user details", "username", username)
			// Add user without details if we can't get them
			if _, exists := userMap[username]; !exists {
				userMap[username] = &ClusterUser{
					Username: username,
					Roles:    []string{"admin"},
				}
			} else {
				userMap[username].Roles = append(userMap[username].Roles, "admin")
			}
			continue
		}
		
		// If user already exists in map, add the admin role
		if existingUser, exists := userMap[username]; exists {
			existingUser.Roles = append(existingUser.Roles, "admin")
		} else {
			// Otherwise create a new entry
			userMap[username] = &ClusterUser{
				Username:    username,
				DisplayName: userInfo.Email, // Use email as display name if no display name field exists
				Email:       userInfo.Email,
				Roles:       []string{"admin"},
			}
		}
	}

	// Map FGA relation names to our role names for display
	fgaRelationToRole := map[string]string{
		"owner":  "owner",
		"member": "member",
	}

	// Get cluster-specific role assignments
	// Based on the OpenFGA schema, cluster has "owner" and "member" relations
	fgaRelations := []string{"owner", "member"}
	for _, relation := range fgaRelations {
		users, err := getUsersWithRole(fgaService, relation, "cluster", clusterName, userManager)
		if err != nil {
			nonCriticalErrors, criticalError := errors.ExtractErrors(err)
			if criticalError != nil {
				return nil, criticalError
			}
			userList.Errors = append(userList.Errors, nonCriticalErrors...)
			continue
		}

		// Get the corresponding role for this relation
		role := fgaRelationToRole[relation]

		// Add users with this role to the map
		for _, username := range users {
			// Get user details
			userInfo, err := userManager.GetUser(context.Background(), username)
			if err != nil {
				klog.ErrorS(err, "Failed to get user details", "username", username)
				// Add user without details if we can't get them
				if _, exists := userMap[username]; !exists {
					userMap[username] = &ClusterUser{
						Username: username,
						Roles:    []string{role},
					}
				} else {
					userMap[username].Roles = append(userMap[username].Roles, role)
				}
				continue
			}
			
			// If user already exists in map, add the role
			if existingUser, exists := userMap[username]; exists {
				existingUser.Roles = append(existingUser.Roles, role)
			} else {
				// Otherwise create a new entry
				userMap[username] = &ClusterUser{
					Username:    username,
					DisplayName: userInfo.Email, // Use email as display name if no display name field exists
					Email:       userInfo.Email,
					Roles:       []string{role},
				}
			}
		}
	}
	
	// Convert the map to a list
	for _, user := range userMap {
		userList.Users = append(userList.Users, *user)
	}

	return userList, nil
}

// getUsersWithRole returns a list of users who have the specified relation with an object
func getUsersWithRole(fgaService *fga.Service, relation, objectType, objectID string, userManager *etcd.UserManager) ([]string, error) {
	if fgaService == nil {
		return []string{}, nil
	}
	
	// If userManager is nil, create one
	if userManager == nil {
		// Create etcd client options
		etcdOpts := etcd.NewDefaultOptions()
		
		// Get etcd client
		etcdClient, err := etcd.GetEtcdClient(etcdOpts)
		if err != nil {
			klog.ErrorS(err, "Failed to get etcd client")
			return []string{}, nil
		}
		
		// Create user manager
		userManager = etcd.NewUserManager(etcdClient)
	}
	
	// List all users from etcd
	users, err := userManager.ListUsers(context.Background())
	if err != nil {
		klog.ErrorS(err, "Failed to list users from etcd")
		return []string{}, err
	}
	
	result := []string{}
	
	// Check each user for the specified relation with the object
	for _, user := range users {
		// Skip users with empty usernames (shouldn't happen, but just to be safe)
		if user.Username == "" {
			continue
		}
		
		// Check if user has the relation
		hasRole, err := fgaService.Check(context.Background(), user.Username, relation, objectType, objectID)
		if err != nil {
			klog.ErrorS(err, "Failed to check user role", 
				"user", user.Username, 
				"role", relation, 
				"objectType", objectType, 
				"objectID", objectID)
			continue
		}
		
		if hasRole {
			result = append(result, user.Username)
		}
	}

	return result, nil
}
