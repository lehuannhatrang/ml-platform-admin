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

package auth

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/pkg/auth/keycloak"
	"github.com/karmada-io/dashboard/pkg/client"
)

// GetAuthenticatedUserFromKeycloak extracts the username from a Keycloak token
func GetAuthenticatedUserFromKeycloak(c *gin.Context) string {
	// Get the token from the Authorization header
	token := client.GetBearerToken(c.Request)
	if token == "" {
		return ""
	}

	// Get the Keycloak client
	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		return ""
	}

	// Validate the token and get claims
	claims, err := kc.ValidateToken(context.Background(), token)
	if err != nil {
		klog.ErrorS(err, "Failed to validate Keycloak token")
		return ""
	}

	return claims.GetUsername()
}

// GetUserRolesFromKeycloak extracts user roles from a Keycloak token
func GetUserRolesFromKeycloak(c *gin.Context) []string {
	// Get the token from the Authorization header
	token := client.GetBearerToken(c.Request)
	if token == "" {
		return []string{}
	}

	// Get the Keycloak client
	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		return []string{}
	}

	// Get user roles
	roles, err := kc.GetUserRoles(context.Background(), token)
	if err != nil {
		klog.ErrorS(err, "Failed to get user roles from Keycloak")
		return []string{}
	}

	return roles
}

// HasKeycloakRole checks if the user has a specific role in Keycloak
func HasKeycloakRole(c *gin.Context, role string) bool {
	roles := GetUserRolesFromKeycloak(c)
	for _, r := range roles {
		if strings.EqualFold(r, role) {
			return true
		}
	}
	return false
}

// IsKeycloakAdmin checks if the user has the admin role in Keycloak
func IsKeycloakAdmin(c *gin.Context) bool {
	// Check for both "admin" and "dashboard-admin" roles
	return HasKeycloakRole(c, "admin") || HasKeycloakRole(c, "dashboard-admin")
}

