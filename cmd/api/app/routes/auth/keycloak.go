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
	"fmt"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/auth/keycloak"
)

// handleKeycloakCallback handles the OAuth2 callback from Keycloak
func handleKeycloakCallback(c *gin.Context) {
	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak authentication not configured",
			Data: nil,
		})
		return
	}

	// In a typical OAuth2 flow, the frontend would handle the callback
	// and exchange the authorization code for tokens
	// This endpoint is provided for reference or if server-side flow is needed
	
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Missing authorization code",
			Data: nil,
		})
		return
	}

	// For now, we'll return the code and let the frontend handle token exchange
	// In production, you might want to exchange the code server-side
	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: gin.H{
			"code": code,
		},
	})
}

// handleKeycloakConfig returns Keycloak configuration for the frontend
func handleKeycloakConfig(c *gin.Context) {
	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusOK, common.BaseResponse{
			Code: http.StatusOK,
			Msg:  "success",
			Data: gin.H{
				"enabled": false,
			},
		})
		return
	}

	config := kc.GetConfig()
	
	// Determine redirect URIs based on environment
	// Always use FRONTEND_URL if set, otherwise use defaults based on ENV_NAME
	baseURL := os.Getenv("FRONTEND_URL")
	
	if baseURL == "" {
		// If FRONTEND_URL not set, determine from ENV_NAME
		env := os.Getenv("ENV_NAME")
		if env == "" {
			env = "prod"
		}
		
		if env == "dev" {
			baseURL = "http://192.168.40.248:5173"
		} else {
			baseURL = "http://localhost:32000"
		}
	}
	
	redirectURI := fmt.Sprintf("%s/callback", baseURL)
	logoutRedirectURI := fmt.Sprintf("%s/sign-out", baseURL)

	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: gin.H{
			"enabled":           true,
			"url":               config.URL,
			"realm":             config.Realm,
			"clientId":          config.ClientID,
			"redirectUri":       redirectURI,
			"logoutRedirectUri": logoutRedirectURI,
		},
	})
}

// handleKeycloakValidate validates a Keycloak token
func handleKeycloakValidate(c *gin.Context) {
	kc := keycloak.GetClient()
	if kc == nil {
		klog.ErrorS(nil, "Keycloak client not initialized")
		c.JSON(http.StatusInternalServerError, common.BaseResponse{
			Code: http.StatusInternalServerError,
			Msg:  "Keycloak authentication not configured",
			Data: nil,
		})
		return
	}

	// Get token from request body
	var req struct {
		Token string `json:"token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  "Invalid request: " + err.Error(),
			Data: nil,
		})
		return
	}

	// Validate the token
	claims, err := kc.ValidateToken(context.Background(), req.Token)
	if err != nil {
		klog.ErrorS(err, "Failed to validate Keycloak token")
		c.JSON(http.StatusUnauthorized, common.BaseResponse{
			Code: http.StatusUnauthorized,
			Msg:  "Invalid or expired token",
			Data: nil,
		})
		return
	}

	// Check if user has admin role
	isAdmin := false
	for _, role := range claims.Roles {
		if role == "admin" || role == "dashboard-admin" {
			isAdmin = true
			break
		}
	}

	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: gin.H{
			"username": claims.GetUsername(),
			"email":    claims.Email,
			"roles":    claims.Roles,
			"isAdmin":  isAdmin,
		},
	})
}

func init() {
	// Register Keycloak routes
	v1 := router.V1()
	
	v1.GET("/keycloak/config", handleKeycloakConfig)
	v1.GET("/keycloak/callback", handleKeycloakCallback)
	v1.POST("/keycloak/validate", handleKeycloakValidate)
}

