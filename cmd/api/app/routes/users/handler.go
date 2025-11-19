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

package users

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/Nerzal/gocloak/v13"
	"github.com/gin-gonic/gin"
	policyv1alpha1 "github.com/karmada-io/karmada/pkg/apis/policy/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/auth/keycloak"
	"github.com/karmada-io/dashboard/pkg/client"
)

// User represents a Keycloak user with relevant fields
type User struct {
	ID            string   `json:"id"`
	Username      string   `json:"username"`
	Email         string   `json:"email"`
	FirstName     string   `json:"firstName"`
	LastName      string   `json:"lastName"`
	Enabled       bool     `json:"enabled"`
	EmailVerified bool     `json:"emailVerified"`
	Roles         []string `json:"roles"`
	CreatedAt     int64    `json:"createdTimestamp"`
}

// CreateUserRequest represents the request to create a user
type CreateUserRequest struct {
	Username      string `json:"username" binding:"required"`
	Email         string `json:"email" binding:"required"`
	FirstName     string `json:"firstName"`
	LastName      string `json:"lastName"`
	Password      string `json:"password" binding:"required"`
	Enabled       bool   `json:"enabled"`
	EmailVerified bool   `json:"emailVerified"`
	Roles         []string `json:"roles"`
}

// UpdateUserRequest represents the request to update a user
type UpdateUserRequest struct {
	Email         string   `json:"email"`
	FirstName     string   `json:"firstName"`
	LastName      string   `json:"lastName"`
	Enabled       *bool    `json:"enabled"`
	EmailVerified *bool    `json:"emailVerified"`
	Roles         []string `json:"roles"`
}

// UpdatePasswordRequest represents the request to update a user's password
type UpdatePasswordRequest struct {
	Password string `json:"password" binding:"required"`
}

// getAdminToken retrieves an admin token for Keycloak operations
// It tries to use service account credentials first, falls back to user token
func getAdminToken(ctx context.Context, kc *keycloak.KeycloakClient, userToken string) (string, error) {
	// Try to get admin token using client credentials (service account)
	adminToken, err := kc.GetAdminToken(ctx)
	if err != nil {
		klog.InfoS("Failed to get service account token, falling back to user token", "error", err)
		klog.InfoS("To fix: Configure KEYCLOAK_CLIENT_SECRET and ensure service account has realm-management roles")
		return userToken, nil
	}
	
	// If admin token is empty (client secret not configured), use user token
	if adminToken == "" {
		klog.InfoS("KEYCLOAK_CLIENT_SECRET not set, using user token for admin operations")
		klog.InfoS("User must have realm-management roles (manage-users, view-users, query-users) to avoid 403 errors")
		return userToken, nil
	}
	
	klog.V(4).InfoS("Using service account token for Keycloak admin operations")
	return adminToken, nil
}

// handleListUsers lists all users in the Keycloak realm
func handleListUsers(c *gin.Context) {
	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak not configured",
			Data: nil,
		})
		return
	}

	// Get token from request
	token := client.GetBearerToken(c.Request)
	if token == "" {
		c.JSON(http.StatusUnauthorized, common.BaseResponse{
			Code: http.StatusUnauthorized,
			Msg:  "Missing authentication token",
			Data: nil,
		})
		return
	}

	config := kc.GetConfig()
	ctx := c.Request.Context()

	// Get admin token for Keycloak operations
	adminToken, err := getAdminToken(ctx, kc, token)
	if err != nil {
		klog.ErrorS(err, "Failed to get admin token")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to authenticate with Keycloak",
			Data: nil,
		})
		return
	}

	// Get users from Keycloak
	gocloakClient := gocloak.NewClient(config.URL)
	users, err := gocloakClient.GetUsers(
		ctx,
		adminToken,
		config.Realm,
		gocloak.GetUsersParams{},
	)

	if err != nil {
		klog.ErrorS(err, "Failed to get users from Keycloak")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to retrieve users: " + err.Error(),
			Data: nil,
		})
		return
	}

	// Convert to our User type
	result := make([]User, 0, len(users))
	for _, u := range users {
		// Get user roles
		userRoles, err := gocloakClient.GetRealmRolesByUserID(
			ctx,
			adminToken,
			config.Realm,
			*u.ID,
		)
		
		roles := make([]string, 0)
		if err == nil {
			for _, role := range userRoles {
				if role.Name != nil {
					roles = append(roles, *role.Name)
				}
			}
		}

		user := User{
			ID:            getStringValue(u.ID),
			Username:      getStringValue(u.Username),
			Email:         getStringValue(u.Email),
			FirstName:     getStringValue(u.FirstName),
			LastName:      getStringValue(u.LastName),
			Enabled:       getBoolValue(u.Enabled),
			EmailVerified: getBoolValue(u.EmailVerified),
			Roles:         roles,
			CreatedAt:     getInt64Value(u.CreatedTimestamp),
		}
		result = append(result, user)
	}

	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: result,
	})
}

// handleGetUser gets a specific user by ID
func handleGetUser(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Missing user ID",
			Data: nil,
		})
		return
	}

	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak not configured",
			Data: nil,
		})
		return
	}

	token := client.GetBearerToken(c.Request)
	if token == "" {
		c.JSON(http.StatusUnauthorized, common.BaseResponse{
			Code: http.StatusUnauthorized,
			Msg:  "Missing authentication token",
			Data: nil,
		})
		return
	}

	config := kc.GetConfig()
	ctx := c.Request.Context()

	// Get admin token for Keycloak operations
	adminToken, err := getAdminToken(ctx, kc, token)
	if err != nil {
		klog.ErrorS(err, "Failed to get admin token")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to authenticate with Keycloak",
			Data: nil,
		})
		return
	}

	gocloakClient := gocloak.NewClient(config.URL)
	u, err := gocloakClient.GetUserByID(ctx, adminToken, config.Realm, userID)
	if err != nil {
		klog.ErrorS(err, "Failed to get user from Keycloak", "userID", userID)
		c.JSON(http.StatusNotFound, common.BaseResponse{
			Code: http.StatusNotFound,
			Msg:  "User not found: " + err.Error(),
			Data: nil,
		})
		return
	}

	// Get user roles
	userRoles, err := gocloakClient.GetRealmRolesByUserID(ctx, adminToken, config.Realm, userID)
	roles := make([]string, 0)
	if err == nil {
		for _, role := range userRoles {
			if role.Name != nil {
				roles = append(roles, *role.Name)
			}
		}
	}

	user := User{
		ID:            getStringValue(u.ID),
		Username:      getStringValue(u.Username),
		Email:         getStringValue(u.Email),
		FirstName:     getStringValue(u.FirstName),
		LastName:      getStringValue(u.LastName),
		Enabled:       getBoolValue(u.Enabled),
		EmailVerified: getBoolValue(u.EmailVerified),
		Roles:         roles,
		CreatedAt:     getInt64Value(u.CreatedTimestamp),
	}

	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: user,
	})
}

// sanitizeEmailForK8sName converts an email to a valid Kubernetes resource name
// Kubernetes names must be lowercase and follow DNS-1123 subdomain rules
func sanitizeEmailForK8sName(email string) string {
	// Convert to lowercase
	name := strings.ToLower(email)
	// Replace @ and . with hyphens
	name = strings.ReplaceAll(name, "@", "-")
	name = strings.ReplaceAll(name, ".", "-")
	// Remove any other invalid characters (keep only alphanumeric and hyphens)
	var result strings.Builder
	for _, char := range name {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '-' {
			result.WriteRune(char)
		}
	}
	return result.String()
}

// createKubeflowProfile creates a Kubeflow Profile for the user in both Karmada and management cluster
func createKubeflowProfile(ctx context.Context, userEmail string) error {
	klog.InfoS("Creating Kubeflow Profile", "userEmail", userEmail)
	
	// Define the Profile GVR
	profileGVR := schema.GroupVersionResource{
		Group:    "kubeflow.org",
		Version:  "v1",
		Resource: "profiles",
	}

	// Sanitize email for use as a Kubernetes resource name
	profileName := sanitizeEmailForK8sName(userEmail)

	// Create the Profile object
	profile := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "kubeflow.org/v1",
			"kind":       "Profile",
			"metadata": map[string]interface{}{
				"name": profileName,
			},
			"spec": map[string]interface{}{
				"owner": map[string]interface{}{
					"kind": "User",
					"name": userEmail,
				},
				"resourceQuotaSpec": map[string]interface{}{},
			},
		},
	}

	// 1. Create the Profile in Karmada (will propagate to member clusters)
	karmadaConfig, _, err := client.GetKarmadaConfig()
	if err != nil {
		return fmt.Errorf("failed to get karmada config: %v", err)
	}

	karmadaDynamicClient, err := dynamic.NewForConfig(karmadaConfig)
	if err != nil {
		return fmt.Errorf("failed to create karmada dynamic client: %v", err)
	}

	_, err = karmadaDynamicClient.Resource(profileGVR).Create(ctx, profile, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create Kubeflow Profile in Karmada: %v", err)
	}
	klog.InfoS("Kubeflow Profile created in Karmada", "userEmail", userEmail, "profileName", profileName)

	// 2. Create the Profile in management cluster directly
	mgmtConfig, _, err := client.GetKubeConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster config, skipping mgmt cluster profile creation")
		// Don't fail the entire operation, Karmada profile is already created
		return nil
	}

	mgmtDynamicClient, err := dynamic.NewForConfig(mgmtConfig)
	if err != nil {
		klog.ErrorS(err, "Failed to create management cluster dynamic client")
		return nil
	}

	// Create a copy of the profile for mgmt cluster
	mgmtProfile := profile.DeepCopy()
	_, err = mgmtDynamicClient.Resource(profileGVR).Create(ctx, mgmtProfile, metav1.CreateOptions{})
	if err != nil {
		klog.ErrorS(err, "Failed to create Kubeflow Profile in management cluster", "userEmail", userEmail)
		// Don't fail the operation, Karmada profile is already created
		return nil
	}
	klog.InfoS("Kubeflow Profile created in management cluster", "userEmail", userEmail, "profileName", profileName)

	klog.InfoS("Kubeflow Profile created successfully in both Karmada and management cluster", "userEmail", userEmail, "profileName", profileName)
	return nil
}

// createProfilePropagationPolicy creates a ClusterPropagationPolicy to propagate the profile to all member clusters
func createProfilePropagationPolicy(ctx context.Context, userEmail string) error {
	klog.InfoS("Creating propagation policy for Kubeflow Profile", "userEmail", userEmail)
	
	// Get karmada client
	karmadaClient := client.InClusterKarmadaClient()
	if karmadaClient == nil {
		return fmt.Errorf("failed to get karmada client")
	}

	// Get all member clusters
	clusterList, err := karmadaClient.ClusterV1alpha1().Clusters().List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list clusters: %v", err)
	}

	// Extract cluster names
	clusterNames := make([]string, 0, len(clusterList.Items))
	for _, cluster := range clusterList.Items {
		clusterNames = append(clusterNames, cluster.Name)
	}

	if len(clusterNames) == 0 {
		klog.InfoS("No member clusters found, skipping propagation policy creation", "userEmail", userEmail)
		return nil
	}

	// Sanitize email for use as a Kubernetes resource name
	profileName := sanitizeEmailForK8sName(userEmail)
	policyName := sanitizeEmailForK8sName(fmt.Sprintf("profile-%s", userEmail))

	// Create ClusterPropagationPolicy
	propagationPolicy := &policyv1alpha1.ClusterPropagationPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name: policyName,
		},
		Spec: policyv1alpha1.PropagationSpec{
			ResourceSelectors: []policyv1alpha1.ResourceSelector{
				{
					APIVersion: "kubeflow.org/v1",
					Kind:       "Profile",
					Name:       profileName,
				},
			},
			Placement: policyv1alpha1.Placement{
				ClusterAffinity: &policyv1alpha1.ClusterAffinity{
					ClusterNames: clusterNames,
				},
			},
		},
	}

	// Create the propagation policy
	_, err = karmadaClient.PolicyV1alpha1().ClusterPropagationPolicies().Create(ctx, propagationPolicy, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create propagation policy: %v", err)
	}

	klog.InfoS("Propagation policy created successfully", "userEmail", userEmail, "profileName", profileName, "policyName", policyName, "clusters", clusterNames)
	return nil
}

// handleCreateUser creates a new user in Keycloak
func handleCreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Invalid request: " + err.Error(),
			Data: nil,
		})
		return
	}

	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak not configured",
			Data: nil,
		})
		return
	}

	token := client.GetBearerToken(c.Request)
	if token == "" {
		c.JSON(http.StatusUnauthorized, common.BaseResponse{
			Code: http.StatusUnauthorized,
			Msg:  "Missing authentication token",
			Data: nil,
		})
		return
	}

	config := kc.GetConfig()
	ctx := c.Request.Context()

	// Get admin token for Keycloak operations
	adminToken, err := getAdminToken(ctx, kc, token)
	if err != nil {
		klog.ErrorS(err, "Failed to get admin token")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to authenticate with Keycloak",
			Data: nil,
		})
		return
	}

	// Create user
	gocloakClient := gocloak.NewClient(config.URL)
	enabled := req.Enabled
	emailVerified := req.EmailVerified
	
	user := gocloak.User{
		Username:      &req.Username,
		Email:         &req.Email,
		FirstName:     &req.FirstName,
		LastName:      &req.LastName,
		Enabled:       &enabled,
		EmailVerified: &emailVerified,
	}

	userID, err := gocloakClient.CreateUser(ctx, adminToken, config.Realm, user)
	if err != nil {
		klog.ErrorS(err, "Failed to create user in Keycloak")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to create user: " + err.Error(),
			Data: nil,
		})
		return
	}

	// Set password
	err = gocloakClient.SetPassword(
		ctx,
		adminToken,
		userID,
		config.Realm,
		req.Password,
		false, // temporary password
	)
	if err != nil {
		klog.ErrorS(err, "Failed to set user password", "userID", userID)
		// Don't fail the request, user is created but password needs to be set manually
	}

	// Assign roles if provided
	if len(req.Roles) > 0 {
		// Get all available roles
		allRoles, err := gocloakClient.GetRealmRoles(ctx, adminToken, config.Realm, gocloak.GetRoleParams{})
		if err == nil {
			rolesToAssign := make([]gocloak.Role, 0)
			for _, roleName := range req.Roles {
				for _, role := range allRoles {
					if role.Name != nil && *role.Name == roleName {
						rolesToAssign = append(rolesToAssign, *role)
						break
					}
				}
			}
			
			if len(rolesToAssign) > 0 {
				err = gocloakClient.AddRealmRoleToUser(ctx, adminToken, config.Realm, userID, rolesToAssign)
				if err != nil {
					klog.ErrorS(err, "Failed to assign roles to user", "userID", userID)
				}
			}
		}
	}

	// Create Kubeflow Profile for the user
	if err := createKubeflowProfile(ctx, req.Email); err != nil {
		klog.ErrorS(err, "Failed to create Kubeflow Profile", "userEmail", req.Email)
		// Don't fail the request, user is created but profile needs to be created manually
		// Continue to create propagation policy anyway
	} else {
		// Create propagation policy to propagate the profile to all member clusters
		if err := createProfilePropagationPolicy(ctx, req.Email); err != nil {
			klog.ErrorS(err, "Failed to create propagation policy", "userEmail", req.Email)
			// Don't fail the request, profile is created but policy needs to be created manually
		}
	}

	c.JSON(http.StatusCreated, common.BaseResponse{
		Code: http.StatusCreated,
		Msg:  "User created successfully",
		Data: gin.H{
			"id": userID,
		},
	})
}

// handleUpdateUser updates an existing user in Keycloak
func handleUpdateUser(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Missing user ID",
			Data: nil,
		})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Invalid request: " + err.Error(),
			Data: nil,
		})
		return
	}

	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak not configured",
			Data: nil,
		})
		return
	}

	token := client.GetBearerToken(c.Request)
	if token == "" {
		c.JSON(http.StatusUnauthorized, common.BaseResponse{
			Code: http.StatusUnauthorized,
			Msg:  "Missing authentication token",
			Data: nil,
		})
		return
	}

	config := kc.GetConfig()
	ctx := c.Request.Context()

	// Get admin token for Keycloak operations
	adminToken, err := getAdminToken(ctx, kc, token)
	if err != nil {
		klog.ErrorS(err, "Failed to get admin token")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to authenticate with Keycloak",
			Data: nil,
		})
		return
	}

	// Get existing user
	gocloakClient := gocloak.NewClient(config.URL)
	existingUser, err := gocloakClient.GetUserByID(ctx, adminToken, config.Realm, userID)
	if err != nil {
		klog.ErrorS(err, "Failed to get user from Keycloak", "userID", userID)
		c.JSON(http.StatusNotFound, common.BaseResponse{
			Code: http.StatusNotFound,
			Msg:  "User not found: " + err.Error(),
			Data: nil,
		})
		return
	}

	// Update user fields
	if req.Email != "" {
		existingUser.Email = &req.Email
	}
	if req.FirstName != "" {
		existingUser.FirstName = &req.FirstName
	}
	if req.LastName != "" {
		existingUser.LastName = &req.LastName
	}
	if req.Enabled != nil {
		existingUser.Enabled = req.Enabled
	}
	if req.EmailVerified != nil {
		existingUser.EmailVerified = req.EmailVerified
	}

	err = gocloakClient.UpdateUser(ctx, adminToken, config.Realm, *existingUser)
	if err != nil {
		klog.ErrorS(err, "Failed to update user in Keycloak", "userID", userID)
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to update user: " + err.Error(),
			Data: nil,
		})
		return
	}

	// Update roles if provided
	if req.Roles != nil {
		// Get current roles
		currentRoles, err := gocloakClient.GetRealmRolesByUserID(ctx, adminToken, config.Realm, userID)
		if err == nil {
			// Remove all current roles
			if len(currentRoles) > 0 {
				// Convert []*gocloak.Role to []gocloak.Role
				rolesToRemove := make([]gocloak.Role, len(currentRoles))
				for i, role := range currentRoles {
					if role != nil {
						rolesToRemove[i] = *role
					}
				}
				err = gocloakClient.DeleteRealmRoleFromUser(ctx, adminToken, config.Realm, userID, rolesToRemove)
				if err != nil {
					klog.ErrorS(err, "Failed to remove current roles", "userID", userID)
				}
			}

			// Add new roles
			if len(req.Roles) > 0 {
				allRoles, err := gocloakClient.GetRealmRoles(ctx, adminToken, config.Realm, gocloak.GetRoleParams{})
				if err == nil {
					rolesToAssign := make([]gocloak.Role, 0)
					for _, roleName := range req.Roles {
						for _, role := range allRoles {
							if role.Name != nil && *role.Name == roleName {
								rolesToAssign = append(rolesToAssign, *role)
								break
							}
						}
					}
					
					if len(rolesToAssign) > 0 {
						err = gocloakClient.AddRealmRoleToUser(ctx, adminToken, config.Realm, userID, rolesToAssign)
						if err != nil {
							klog.ErrorS(err, "Failed to assign new roles", "userID", userID)
						}
					}
				}
			}
		}
	}

	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "User updated successfully",
		Data: nil,
	})
}

// handleUpdatePassword updates a user's password
func handleUpdatePassword(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Missing user ID",
			Data: nil,
		})
		return
	}

	var req UpdatePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Invalid request: " + err.Error(),
			Data: nil,
		})
		return
	}

	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak not configured",
			Data: nil,
		})
		return
	}

	token := client.GetBearerToken(c.Request)
	if token == "" {
		c.JSON(http.StatusUnauthorized, common.BaseResponse{
			Code: http.StatusUnauthorized,
			Msg:  "Missing authentication token",
			Data: nil,
		})
		return
	}

	config := kc.GetConfig()
	ctx := c.Request.Context()

	// Get admin token for Keycloak operations
	adminToken, err := getAdminToken(ctx, kc, token)
	if err != nil {
		klog.ErrorS(err, "Failed to get admin token")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to authenticate with Keycloak",
			Data: nil,
		})
		return
	}

	gocloakClient := gocloak.NewClient(config.URL)
	err = gocloakClient.SetPassword(
		ctx,
		adminToken,
		userID,
		config.Realm,
		req.Password,
		false, // temporary password
	)
	if err != nil {
		klog.ErrorS(err, "Failed to update user password", "userID", userID)
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to update password: " + err.Error(),
			Data: nil,
		})
		return
	}

	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "Password updated successfully",
		Data: nil,
	})
}

// deleteKubeflowProfile deletes the Kubeflow Profile for a user from both Karmada and management cluster
func deleteKubeflowProfile(ctx context.Context, userEmail string) error {
	klog.InfoS("Deleting Kubeflow Profile", "userEmail", userEmail)
	
	// Define the Profile GVR
	profileGVR := schema.GroupVersionResource{
		Group:    "kubeflow.org",
		Version:  "v1",
		Resource: "profiles",
	}

	// Sanitize email for use as a Kubernetes resource name
	profileName := sanitizeEmailForK8sName(userEmail)

	var deleteErrors []error

	// 1. Delete the Profile from Karmada
	karmadaConfig, _, err := client.GetKarmadaConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get karmada config")
		deleteErrors = append(deleteErrors, fmt.Errorf("failed to get karmada config: %v", err))
	} else {
		karmadaDynamicClient, err := dynamic.NewForConfig(karmadaConfig)
		if err != nil {
			klog.ErrorS(err, "Failed to create karmada dynamic client")
			deleteErrors = append(deleteErrors, fmt.Errorf("failed to create karmada dynamic client: %v", err))
		} else {
			err = karmadaDynamicClient.Resource(profileGVR).Delete(ctx, profileName, metav1.DeleteOptions{})
			if err != nil {
				klog.ErrorS(err, "Failed to delete Kubeflow Profile from Karmada", "profileName", profileName)
				deleteErrors = append(deleteErrors, fmt.Errorf("failed to delete from Karmada: %v", err))
			} else {
				klog.InfoS("Kubeflow Profile deleted from Karmada", "userEmail", userEmail, "profileName", profileName)
			}
		}
	}

	// 2. Delete the Profile from management cluster
	mgmtConfig, _, err := client.GetKubeConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get management cluster config")
		deleteErrors = append(deleteErrors, fmt.Errorf("failed to get management cluster config: %v", err))
	} else {
		mgmtDynamicClient, err := dynamic.NewForConfig(mgmtConfig)
		if err != nil {
			klog.ErrorS(err, "Failed to create management cluster dynamic client")
			deleteErrors = append(deleteErrors, fmt.Errorf("failed to create management dynamic client: %v", err))
		} else {
			err = mgmtDynamicClient.Resource(profileGVR).Delete(ctx, profileName, metav1.DeleteOptions{})
			if err != nil {
				klog.ErrorS(err, "Failed to delete Kubeflow Profile from management cluster", "profileName", profileName)
				deleteErrors = append(deleteErrors, fmt.Errorf("failed to delete from management cluster: %v", err))
			} else {
				klog.InfoS("Kubeflow Profile deleted from management cluster", "userEmail", userEmail, "profileName", profileName)
			}
		}
	}

	if len(deleteErrors) > 0 {
		return fmt.Errorf("errors during profile deletion: %v", deleteErrors)
	}

	klog.InfoS("Kubeflow Profile deleted successfully from both Karmada and management cluster", "userEmail", userEmail, "profileName", profileName)
	return nil
}

// deleteProfilePropagationPolicy deletes the ClusterPropagationPolicy for a user's profile
func deleteProfilePropagationPolicy(ctx context.Context, userEmail string) error {
	klog.InfoS("Deleting propagation policy for Kubeflow Profile", "userEmail", userEmail)
	
	// Get karmada client
	karmadaClient := client.InClusterKarmadaClient()
	if karmadaClient == nil {
		return fmt.Errorf("failed to get karmada client")
	}

	// Sanitize email for use as a Kubernetes resource name
	policyName := sanitizeEmailForK8sName(fmt.Sprintf("profile-%s", userEmail))

	// Delete the propagation policy
	err := karmadaClient.PolicyV1alpha1().ClusterPropagationPolicies().Delete(ctx, policyName, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete propagation policy: %v", err)
	}

	klog.InfoS("Propagation policy deleted successfully", "userEmail", userEmail, "policyName", policyName)
	return nil
}

// handleDeleteUser deletes a user from Keycloak
func handleDeleteUser(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Missing user ID",
			Data: nil,
		})
		return
	}

	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak not configured",
			Data: nil,
		})
		return
	}

	token := client.GetBearerToken(c.Request)
	if token == "" {
		c.JSON(http.StatusUnauthorized, common.BaseResponse{
			Code: http.StatusUnauthorized,
			Msg:  "Missing authentication token",
			Data: nil,
		})
		return
	}

	config := kc.GetConfig()
	ctx := c.Request.Context()

	// Get admin token for Keycloak operations
	adminToken, err := getAdminToken(ctx, kc, token)
	if err != nil {
		klog.ErrorS(err, "Failed to get admin token")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to authenticate with Keycloak",
			Data: nil,
		})
		return
	}

	gocloakClient := gocloak.NewClient(config.URL)
	
	// Get user details before deletion to retrieve the email
	user, err := gocloakClient.GetUserByID(ctx, adminToken, config.Realm, userID)
	if err != nil {
		klog.ErrorS(err, "Failed to get user from Keycloak", "userID", userID)
		c.JSON(http.StatusNotFound, common.BaseResponse{
			Code: http.StatusNotFound,
			Msg:  "User not found: " + err.Error(),
			Data: nil,
		})
		return
	}

	userEmail := getStringValue(user.Email)
	
	// Delete user from Keycloak
	err = gocloakClient.DeleteUser(ctx, adminToken, config.Realm, userID)
	if err != nil {
		klog.ErrorS(err, "Failed to delete user from Keycloak", "userID", userID)
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to delete user: " + err.Error(),
			Data: nil,
		})
		return
	}

	// Delete the propagation policy first (to stop propagation to member clusters)
	if userEmail != "" {
		if err := deleteProfilePropagationPolicy(ctx, userEmail); err != nil {
			klog.ErrorS(err, "Failed to delete propagation policy", "userEmail", userEmail)
			// Don't fail the request, continue to delete the profile
		}

		// Delete the Kubeflow Profile
		if err := deleteKubeflowProfile(ctx, userEmail); err != nil {
			klog.ErrorS(err, "Failed to delete Kubeflow Profile", "userEmail", userEmail)
			// Don't fail the request, profile deletion can be done manually if needed
		}
	} else {
		klog.InfoS("User email is empty, skipping Kubeflow Profile cleanup", "userID", userID)
	}

	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "User deleted successfully",
		Data: nil,
	})
}

// handleGetRoles gets all available roles in the realm
func handleGetRoles(c *gin.Context) {
	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak not configured",
			Data: nil,
		})
		return
	}

	token := client.GetBearerToken(c.Request)
	if token == "" {
		c.JSON(http.StatusUnauthorized, common.BaseResponse{
			Code: http.StatusUnauthorized,
			Msg:  "Missing authentication token",
			Data: nil,
		})
		return
	}

	config := kc.GetConfig()
	ctx := c.Request.Context()

	// Get admin token for Keycloak operations
	adminToken, err := getAdminToken(ctx, kc, token)
	if err != nil {
		klog.ErrorS(err, "Failed to get admin token")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to authenticate with Keycloak",
			Data: nil,
		})
		return
	}

	gocloakClient := gocloak.NewClient(config.URL)
	roles, err := gocloakClient.GetRealmRoles(ctx, adminToken, config.Realm, gocloak.GetRoleParams{})
	if err != nil {
		klog.ErrorS(err, "Failed to get roles from Keycloak")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Failed to retrieve roles: " + err.Error(),
			Data: nil,
		})
		return
	}

	roleNames := make([]string, 0)
	for _, role := range roles {
		if role.Name != nil {
			roleNames = append(roleNames, *role.Name)
		}
	}

	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: roleNames,
	})
}

// Helper functions
func getStringValue(ptr *string) string {
	if ptr != nil {
		return *ptr
	}
	return ""
}

func getBoolValue(ptr *bool) bool {
	if ptr != nil {
		return *ptr
	}
	return false
}

func getInt64Value(ptr *int64) int64 {
	if ptr != nil {
		return *ptr
	}
	return 0
}

func init() {
	v1 := router.V1()

	// User management routes
	v1.GET("/users", handleListUsers)
	v1.GET("/users/:id", handleGetUser)
	v1.POST("/users", handleCreateUser)
	v1.PUT("/users/:id", handleUpdateUser)
	v1.PUT("/users/:id/password", handleUpdatePassword)
	v1.DELETE("/users/:id", handleDeleteUser)
	
	// Role management routes
	v1.GET("/roles", handleGetRoles)
}

