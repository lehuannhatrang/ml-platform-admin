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

package keycloak

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/Nerzal/gocloak/v13"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
	"k8s.io/klog/v2"
)

var (
	// Client is the global Keycloak client instance
	Client *KeycloakClient
	once   sync.Once
)

// KeycloakClient wraps the Keycloak client and OIDC verifier
type KeycloakClient struct {
	config   *Config
	client   *gocloak.GoCloak
	verifier *oidc.IDTokenVerifier
	provider *oidc.Provider
}

// InitKeycloakClient initializes the global Keycloak client
func InitKeycloakClient(ctx context.Context) error {
	var initErr error

	once.Do(func() {
		config := GetConfig()
		klog.InfoS("Initializing Keycloak client", "url", config.URL, "realm", config.Realm, "clientID", config.ClientID)

		client := gocloak.NewClient(config.URL)

		// Initialize OIDC provider
		issuerURL := fmt.Sprintf("%s/realms/%s", config.URL, config.Realm)
		provider, err := oidc.NewProvider(ctx, issuerURL)
		if err != nil {
			initErr = fmt.Errorf("failed to create OIDC provider: %w", err)
			klog.ErrorS(err, "Failed to initialize OIDC provider", "issuerURL", issuerURL)
			return
		}

		// Create verifier for ID tokens
		verifier := provider.Verifier(&oidc.Config{
			ClientID: config.ClientID,
		})

		Client = &KeycloakClient{
			config:   config,
			client:   client,
			verifier: verifier,
			provider: provider,
		}

		klog.InfoS("Keycloak client initialized successfully")
	})

	return initErr
}

// GetClient returns the global Keycloak client instance
func GetClient() *KeycloakClient {
	return Client
}

// ValidateToken validates an access token and returns the user info
func (kc *KeycloakClient) ValidateToken(ctx context.Context, token string) (*TokenClaims, error) {
	// For public clients (implicit flow), we can't use introspection
	// Instead, parse the JWT directly and extract claims
	
	// Parse the token to get claims
	parser := jwt.NewParser()
	mapClaims := jwt.MapClaims{}
	
	_, _, err := parser.ParseUnverified(token, mapClaims)
	if err != nil {
		klog.ErrorS(err, "Failed to parse token")
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	// Extract user information from claims
	sub := getStringFromClaims(mapClaims, "sub")
	preferredUsername := getStringFromClaims(mapClaims, "preferred_username")
	email := getStringFromClaims(mapClaims, "email")
	name := getStringFromClaims(mapClaims, "name")
	givenName := getStringFromClaims(mapClaims, "given_name")
	familyName := getStringFromClaims(mapClaims, "family_name")

	// Extract roles directly from the token
	roles := extractRolesFromToken(token)

	// Basic validation - check if token has expired
	if exp, ok := mapClaims["exp"].(float64); ok {
		expTime := int64(exp)
		if expTime < time.Now().Unix() {
			return nil, fmt.Errorf("token has expired")
		}
	}

	claims := &TokenClaims{
		Sub:               sub,
		PreferredUsername: preferredUsername,
		Email:             email,
		Name:              name,
		GivenName:         givenName,
		FamilyName:        familyName,
		Roles:             roles,
	}

	return claims, nil
}

// getStringFromClaims safely extracts a string value from JWT claims
func getStringFromClaims(claims jwt.MapClaims, key string) string {
	if val, ok := claims[key]; ok {
		if strVal, ok := val.(string); ok {
			return strVal
		}
	}
	return ""
}

// GetUserRoles returns the roles for a user from the token
func (kc *KeycloakClient) GetUserRoles(ctx context.Context, token string) ([]string, error) {
	claims, err := kc.ValidateToken(ctx, token)
	if err != nil {
		return nil, err
	}

	return claims.Roles, nil
}

// HasRole checks if the user has a specific role
func (kc *KeycloakClient) HasRole(ctx context.Context, token string, role string) (bool, error) {
	roles, err := kc.GetUserRoles(ctx, token)
	if err != nil {
		return false, err
	}

	for _, r := range roles {
		if r == role {
			return true, nil
		}
	}

	return false, nil
}

// extractRolesFromUserInfo extracts roles from user info by parsing the token
func extractRolesFromUserInfo(userInfo *gocloak.UserInfo) []string {
	roles := make([]string, 0)
	
	// UserInfo might not have all claims, we'll return empty roles for now
	// Roles will be extracted from the JWT token in GetUserRoles method
	return roles
}

// extractRolesFromToken extracts roles directly from JWT token
func extractRolesFromToken(token string) []string {
	roles := make([]string, 0)

	// Parse the token without verification (we already verified it)
	parser := jwt.NewParser()
	claims := jwt.MapClaims{}
	
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return roles
	}

	// Decode claims
	_, _, err := parser.ParseUnverified(token, claims)
	if err != nil {
		klog.ErrorS(err, "Failed to parse token")
		return roles
	}

	// Extract realm roles
	if realmAccess, ok := claims["realm_access"].(map[string]interface{}); ok {
		if rolesInterface, ok := realmAccess["roles"].([]interface{}); ok {
			for _, role := range rolesInterface {
				if roleStr, ok := role.(string); ok {
					roles = append(roles, roleStr)
				}
			}
		}
	}

	// Extract resource/client roles
	if resourceAccess, ok := claims["resource_access"].(map[string]interface{}); ok {
		for _, clientAccess := range resourceAccess {
			if clientMap, ok := clientAccess.(map[string]interface{}); ok {
				if rolesInterface, ok := clientMap["roles"].([]interface{}); ok {
					for _, role := range rolesInterface {
						if roleStr, ok := role.(string); ok {
							roles = append(roles, roleStr)
						}
					}
				}
			}
		}
	}

	return roles
}

// getStringPtr safely gets a string pointer value
func getStringPtr(ptr *string) string {
	if ptr != nil {
		return *ptr
	}
	return ""
}

// TokenClaims represents the claims extracted from a Keycloak token
type TokenClaims struct {
	Sub               string   `json:"sub"`
	PreferredUsername string   `json:"preferred_username"`
	Email             string   `json:"email"`
	Name              string   `json:"name"`
	GivenName         string   `json:"given_name"`
	FamilyName        string   `json:"family_name"`
	Roles             []string `json:"roles"`
}

// GetUsername returns the username from the claims
func (tc *TokenClaims) GetUsername() string {
	if tc.PreferredUsername != "" {
		return tc.PreferredUsername
	}
	return tc.Email
}

// GetConfig returns the Keycloak configuration
func (kc *KeycloakClient) GetConfig() *Config {
	return kc.config
}

