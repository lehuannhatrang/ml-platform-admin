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
	"strings"

	"github.com/gin-gonic/gin"
	
	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/pkg/auth"
	"github.com/karmada-io/dashboard/pkg/auth/keycloak"
	"github.com/karmada-io/dashboard/pkg/client"
)

// GetAuthenticatedUser retrieves the username of the currently authenticated user
// from the Gin context or Authorization header.
func GetAuthenticatedUser(c *gin.Context) string {
	// First check if user info is already in the context (may have been set by middleware)
	user, exists := c.Get("user")
	if exists {
		// Check for User type
		if userObj, ok := user.(*v1.User); ok && userObj.Name != "" {
			client.SetCurrentUser(userObj.Name)
			return userObj.Name
		}

		// Fallback to map for flexibility
		if userMap, ok := user.(map[string]interface{}); ok {
			if name, ok := userMap["Name"].(string); ok && name != "" {
				client.SetCurrentUser(name)
				return name
			}
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

	// Extract the token
	tokenString := authHeader[len(prefix):]
	
	// Try Keycloak authentication first if available
	if kc := keycloak.GetClient(); kc != nil {
		claims, err := kc.ValidateToken(c.Request.Context(), tokenString)
		if err == nil {
			username := claims.GetUsername()
			client.SetCurrentUser(username)
			// Store roles in context for authorization
			c.Set("user_roles", claims.Roles)
			return username
		}
	}
	
	// Fallback to JWT validation
	claims, err := auth.ValidateToken(tokenString)
	if err != nil {
		return ""
	}

	// Store the username for use in non-context functions
	client.SetCurrentUser(claims.Username)
	return claims.Username
}
