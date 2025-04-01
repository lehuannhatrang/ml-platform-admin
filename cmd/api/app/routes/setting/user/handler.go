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

package user

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/auth"
	etcd "github.com/karmada-io/dashboard/pkg/etcd"
	"github.com/karmada-io/dashboard/pkg/resource/setting"
)

// handleGetUserSetting retrieves the user setting for the current authenticated user
func handleGetUserSetting(c *gin.Context) {
	username := getAuthenticatedUser(c)
	if username == "" {
		common.Fail(c, fmt.Errorf("unauthorized user"))
		return
	}

	result, err := setting.GetUserSetting(context.TODO(), username)
	if err != nil {
		klog.ErrorS(err, "GetUserSetting failed", "username", username)
		common.Fail(c, err)
		return
	}

	// Get the user's role information
	var role string

	// First check if user info is already in the context
	user, exists := c.Get("user")
	if exists {
		if userObj, ok := user.(*v1.User); ok && userObj.Role != "" {
			role = userObj.Role
		}
	}

	// If role not found in context, try to get it from token or etcd
	if role == "" {
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			// Extract token
			const prefix = "Bearer "
			if len(authHeader) > len(prefix) && strings.HasPrefix(authHeader, prefix) {
				tokenString := authHeader[len(prefix):]
				
				// Validate token and get claims
				claims, err := auth.ValidateToken(tokenString)
				if err == nil && claims != nil && claims.Role != "" {
					role = claims.Role
				} else {
					// If not in token, try etcd
					userManager := auth.GetUserManager()
					if userManager != nil {
						ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
						defer cancel()
						etcdUser, err := userManager.GetUser(ctx, username)
						if err == nil && etcdUser != nil {
							role = etcdUser.Role
						}
					}
				}
			}
		}
	}

	// Set the role in the preferences if it's available and not already set
	if role != "" {
		if result.Preferences == nil {
			result.Preferences = make(map[string]string)
		}
		// Only set if not already present
		if _, exists := result.Preferences["role"]; !exists {
			result.Preferences["role"] = role
		}
	}

	common.Success(c, result)
}

// handlePostUserSetting creates a new user setting for the current authenticated user
func handlePostUserSetting(c *gin.Context) {
	username := getAuthenticatedUser(c)
	if username == "" {
		common.Fail(c, fmt.Errorf("unauthorized user"))
		return
	}

	userSettingRequest := new(v1.UserSettingRequest)
	if err := c.ShouldBind(userSettingRequest); err != nil {
		klog.ErrorS(err, "Could not read user setting request")
		common.Fail(c, err)
		return
	}

	// Ensure the username in the setting matches the authenticated user
	userSettingRequest.Username = username

	err := setting.CreateUserSetting(context.TODO(), userSettingRequest.UserSetting)
	if err != nil {
		klog.ErrorS(err, "CreateUserSetting failed", "username", username)
		common.Fail(c, err)
		return
	}
	common.Success(c, userSettingRequest)
}

// handlePutUserSetting updates an existing user setting for the current authenticated user
func handlePutUserSetting(c *gin.Context) {
	username := getAuthenticatedUser(c)
	if username == "" {
		common.Fail(c, fmt.Errorf("unauthorized user"))
		return
	}

	userSettingRequest := new(v1.UserSettingRequest)
	if err := c.ShouldBind(userSettingRequest); err != nil {
		klog.ErrorS(err, "Could not read user setting request")
		common.Fail(c, err)
		return
	}

	// Ensure the username in the setting matches the authenticated user
	userSettingRequest.Username = username

	err := setting.UpdateUserSetting(context.TODO(), userSettingRequest.UserSetting)
	if err != nil {
		klog.ErrorS(err, "UpdateUserSetting failed", "username", username)
		common.Fail(c, err)
		return
	}
	common.Success(c, userSettingRequest)
}

// handleDeleteUserSetting deletes the user setting for the current authenticated user
func handleDeleteUserSetting(c *gin.Context) {
	username := getAuthenticatedUser(c)
	if username == "" {
		common.Fail(c, fmt.Errorf("unauthorized user"))
		return
	}

	err := setting.DeleteUserSetting(context.TODO(), username)
	if err != nil {
		klog.ErrorS(err, "DeleteUserSetting failed", "username", username)
		common.Fail(c, err)
		return
	}
	common.Success(c, "User settings deleted successfully")
}

// handleGetAllUsers retrieves a list of all users with settings
// Requires administrative privileges
func handleGetAllUsers(c *gin.Context) {
	// Check if the current user has admin privileges
	username := getAuthenticatedUser(c)
	if username == "" {
		common.Fail(c, fmt.Errorf("unauthorized user"))
		return
	}

	// TODO: Add proper role-based access control here
	// For now, we'll use a simple check (this should be replaced with proper RBAC)
	isAdmin := checkAdminRole(c)
	if !isAdmin {
		common.Fail(c, fmt.Errorf("insufficient privileges: admin role required"))
		return
	}

	users, err := setting.GetAllUsers(context.TODO())
	if err != nil {
		klog.ErrorS(err, "GetAllUsers failed")
		common.Fail(c, err)
		return
	}
	common.Success(c, users)
}

// checkAdminRole checks if the current user has admin privileges
func checkAdminRole(c *gin.Context) bool {
	// First check if user info is already in the context (may have been set by middleware)
	user, exists := c.Get("user")
	if exists {
		if userObj, ok := user.(*v1.User); ok {
			return userObj.Role == "admin"
		}
	}

	// If not in context, extract from Authorization header
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return false
	}

	// The header format should be "Bearer <token>"
	const prefix = "Bearer "
	if len(authHeader) <= len(prefix) || !strings.HasPrefix(authHeader, prefix) {
		return false
	}

	tokenString := authHeader[len(prefix):]

	// Validate the token
	claims, err := auth.ValidateToken(tokenString)
	if err != nil {
		return false
	}

	// Check if the role from the token is admin
	if claims.Role == "admin" {
		return true
	}

	// Double-check with user details from etcd
	userManager := auth.GetUserManager()
	if userManager == nil {
		return claims.Role == "admin" // Fallback to just the role from token
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	etcdUser, err := userManager.GetUser(ctx, claims.Username)
	if err != nil {
		return claims.Role == "admin" // Fallback to just the role from token
	}

	return etcdUser.Role == "admin"
}

// getAuthenticatedUser retrieves the username of the currently authenticated user
func getAuthenticatedUser(c *gin.Context) string {
	// First check if user info is already in the context (may have been set by middleware)
	user, exists := c.Get("user")
	if exists {
		if userObj, ok := user.(*v1.User); ok {
			return userObj.Name
		}
	}

	// If not in context, extract from Authorization header
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return ""
	}

	// The header format should be "Bearer <token>"
	const prefix = "Bearer "
	if len(authHeader) <= len(prefix) || !strings.HasPrefix(authHeader, prefix) {
		return ""
	}

	tokenString := authHeader[len(prefix):]

	// Validate the token
	claims, err := auth.ValidateToken(tokenString)
	if err != nil {
		return ""
	}

	// Get user details from etcd
	userManager := auth.GetUserManager()
	if userManager == nil {
		return claims.Username // Fallback to just the username from token if no user manager
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	user, err = userManager.GetUser(ctx, claims.Username)
	if err != nil {
		return claims.Username // Fallback to just the username from token
	}

	if etcdUser, ok := user.(*etcd.User); ok {
		return etcdUser.Username
	}

	return claims.Username // Fallback
}

func init() {
	r := router.V1()
	r.GET("/setting/user", handleGetUserSetting)
	r.POST("/setting/user", handlePostUserSetting)
	r.PUT("/setting/user", handlePutUserSetting)
	r.DELETE("/setting/user", handleDeleteUserSetting)
	r.GET("/setting/users", handleGetAllUsers)
}
