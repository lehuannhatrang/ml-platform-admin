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
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"k8s.io/klog/v2"

	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/pkg/auth"
	"github.com/karmada-io/dashboard/pkg/auth/keycloak"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
)

const (
	tokenServiceAccountKey = "serviceaccount"
)

// isKeycloakToken checks if a token is from Keycloak by examining its signing algorithm
func isKeycloakToken(token string) bool {
	// Parse token header without validation
	parsed, _ := jwt.Parse(token, nil)
	if parsed == nil {
		return false
	}
	
	// Keycloak tokens use RS256 (RSA signature)
	// Legacy tokens use HS256 (HMAC signature)
	if alg, ok := parsed.Header["alg"].(string); ok {
		return alg == "RS256" || alg == "RS384" || alg == "RS512"
	}
	
	return false
}

func me(request *http.Request) (*v1.User, int, error) {
	token := client.GetBearerToken(request)
	if token == "" {
		return nil, http.StatusUnauthorized, errors.NewUnauthorized("Missing authentication token")
	}

	var user *v1.User
	var username string
	var userRole string

	// Try Keycloak validation first if Keycloak is enabled
	kc := keycloak.GetClient()
	if kc != nil {
		keycloakClaims, err := kc.ValidateToken(request.Context(), token)
		if err == nil {
			// Keycloak token is valid
			klog.V(4).InfoS("Token validated via Keycloak", "username", keycloakClaims.GetUsername())
			username = keycloakClaims.GetUsername()
			
			// Determine role from Keycloak roles
			userRole = "basic_user"
			for _, role := range keycloakClaims.Roles {
				if role == "admin" || role == "dashboard-admin" {
					userRole = "admin"
					break
				}
			}
			
			user = &v1.User{
				Name:          username,
				Authenticated: true,
				Role:          userRole,
				InitToken:     true, // Keycloak users don't need SA token
			}
			
			// For Keycloak users, we're done - return immediately
			return user, http.StatusOK, nil
		} else {
			klog.V(4).InfoS("Token validation via Keycloak failed", "error", err)
			
			// Check if this is a Keycloak token (RS256 signature)
			// If so, don't try legacy validation - just return unauthorized
			if isKeycloakToken(token) {
				klog.ErrorS(err, "Keycloak token validation failed (token may be expired or invalid)")
				return nil, http.StatusUnauthorized, errors.NewUnauthorized("Token validation failed")
			}
			
			// Not a Keycloak token, try legacy JWT validation
			klog.V(4).InfoS("Not a Keycloak token, trying legacy JWT validation")
		}
	}

	// If Keycloak validation didn't work, try legacy JWT validation
	if user == nil {
		claims, err := auth.ValidateToken(token)
		if err != nil {
			klog.ErrorS(err, "Invalid JWT token (both Keycloak and legacy validation failed)")
			return nil, http.StatusUnauthorized, errors.NewUnauthorized("Invalid authentication token")
		}

		user = getUserFromToken(token)
		username = claims.Username
		
		// Set role from the claims if available
		if claims != nil && claims.Role != "" {
			user.Role = claims.Role
		} else if claims != nil && claims.Username != "" {
			// Try to get user details from the user manager
			userManager := auth.GetUserManager()
			if userManager != nil {
				etcdUser, err := userManager.GetUser(request.Context(), claims.Username)
				if err == nil && etcdUser != nil {
					user.Role = etcdUser.Role
				} else {
					klog.ErrorS(err, "Failed to get user details from etcd", "username", claims.Username)
				}
			}
		}
	}

	// For legacy JWT users, check service account token
	saToken, err := client.GetServiceAccountTokenFromEtcd(request.Context())
	if err != nil || saToken == "" {
		klog.ErrorS(err, "Failed to get service account token from etcd")
		user.InitToken = false
		return user, http.StatusOK, nil
	}

	tmpReq, _ := http.NewRequest("GET", "/", nil)
	tmpReq.Header.Set("Authorization", "Bearer "+saToken)

	karmadaClient, err := client.GetKarmadaClientFromRequest(tmpReq)
	if err != nil {
		klog.ErrorS(err, "Failed to create Karmada client with service account token")
		user.InitToken = false
		return user, http.StatusOK, nil
	}

	if _, err = karmadaClient.Discovery().ServerVersion(); err != nil {
		klog.ErrorS(err, "Failed to get Karmada server version using service account token")
		user.InitToken = false
		return user, http.StatusOK, nil
	}

	user.InitToken = true
	return user, http.StatusOK, nil
}

func getUserFromToken(token string) *v1.User {
	parsed, _ := jwt.Parse(token, nil)
	if parsed == nil {
		return &v1.User{
			Authenticated: true,
			InitToken:     false,
		}
	}

	claims := parsed.Claims.(jwt.MapClaims)

	found, value := traverse(tokenServiceAccountKey, claims)
	if !found {
		return &v1.User{
			Authenticated: true,
			InitToken:     false,
		}
	}

	var user v1.User
	if !transcode(value, &user) {
		return &v1.User{
			Authenticated: true,
			InitToken:     false,
		}
	}

	// Make sure the InitToken field is never nil
	if !user.InitToken {
		user.InitToken = false
	}

	return &user
}

func traverse(key string, m map[string]interface{}) (found bool, value interface{}) {
	if v, found := m[key]; found {
		return true, v
	}

	for _, v := range m {
		if mv, ok := v.(map[string]interface{}); ok {
			if found, v := traverse(key, mv); found {
				return true, v
			}
		}
	}

	return false, nil
}

func transcode(in, out interface{}) bool {
	buf := new(bytes.Buffer)
	if err := json.NewEncoder(buf).Encode(in); err != nil {
		return false
	}
	return json.NewDecoder(buf).Decode(out) == nil
}

// Response types
// Include initToken explicitly in the response
type MeData struct {
	Name          string `json:"name,omitempty"`
	Authenticated bool   `json:"authenticated"`
	Role          string `json:"role,omitempty"`
	InitToken     bool   `json:"initToken"`
}

type MeResponse struct {
	Code    int     `json:"code"`
	Message string  `json:"message"`
	Data    *MeData `json:"data"`
}

// meHandler is the HTTP handler for the /me endpoint
func meHandler(w http.ResponseWriter, r *http.Request) {
	user, code, err := me(r)

	response := MeResponse{
		Code: code,
	}

	if err != nil {
		response.Message = err.Error()
		// Use empty data with authenticated=false and initToken=false
		response.Data = &MeData{
			Authenticated: false,
			InitToken:     false,
		}
	} else {
		response.Message = "success"
		response.Data = &MeData{
			Name:          user.Name,
			Authenticated: user.Authenticated,
			Role:          user.Role,
			InitToken:     user.InitToken,
		}
	}

	// Set content type and marshal to JSON
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)

	if err := json.NewEncoder(w).Encode(response); err != nil {
		klog.ErrorS(err, "Failed to encode response")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}
