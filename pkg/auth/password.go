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
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/pkg/auth/fga"
	"github.com/karmada-io/dashboard/pkg/etcd"
)

var (
	userManager            *etcd.UserManager
	userManagerMutex       sync.RWMutex
	userManagerInitialized bool
	jwtSecret              = []byte(getJWTSecret())
	tokenExpiryDuration    = 24 * time.Hour
)

// Claims represents the JWT claims
type Claims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// InitUserManager initializes the user manager
func InitUserManager(etcdOpts *etcd.Options) error {
	// Take a write lock during initialization
	userManagerMutex.Lock()
	defer userManagerMutex.Unlock()

	// If already initialized successfully, just return
	if userManagerInitialized && userManager != nil {
		klog.V(4).InfoS("User manager already initialized, skipping")
		return nil
	}

	klog.InfoS("Initializing user manager...")
	client, err := etcd.GetEtcdClient(etcdOpts)
	if err != nil {
		klog.ErrorS(err, "Failed to get etcd client")
		return fmt.Errorf("failed to get etcd client: %v", err)
	}

	if client == nil {
		klog.Error("Etcd client is nil after initialization")
		return fmt.Errorf("etcd client is nil after initialization")
	}

	klog.InfoS("Etcd client connection successful")

	// Create the user manager instance
	userManager = etcd.NewUserManager(client)

	// Try to ping etcd with a simple operation to verify connectivity
	// but don't use UserExists yet since it requires a working connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Try a simple client.Get operation instead
	_, err = client.Get(ctx, "/ping-test")
	if err != nil {
		klog.ErrorS(err, "Etcd ping test failed")
		userManager = nil // Reset to nil on failure
		return fmt.Errorf("etcd ping test failed: %v", err)
	}

	klog.InfoS("User manager initialized and connectivity verified successfully")
	userManagerInitialized = true

	// Initialize admin user with default password if specified
	defaultAdminPassword := os.Getenv("KARMADA_DASHBOARD_ADMIN_PASSWORD")
	if defaultAdminPassword == "" {
		defaultAdminPassword = "admin123"
	}
	if defaultAdminPassword != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		klog.InfoS("Attempting to initialize admin user with provided password")

		// First check if admin user exists to avoid errors
		exists, err := userManager.UserExists(ctx, "admin")
		if err != nil {
			klog.ErrorS(err, "Failed to check if admin user exists")
			// Continue anyway - we'll try to create the user
		}

		adminUserCreated := false
		if !exists || err != nil {
			// Create the admin user
			if err := userManager.CreateUser(ctx, "admin", defaultAdminPassword, "admin@example.com", "admin"); err != nil {
				klog.ErrorS(err, "Failed to create admin user")
			} else {
				klog.InfoS("Admin user created successfully")
				adminUserCreated = true
			}
		} else {
			klog.InfoS("Admin user already exists")
			adminUserCreated = true
		}

		// If admin user exists or was created successfully, set up OpenFGA permissions
		if adminUserCreated {
			// Initialize OpenFGA relationship for admin user
			fgaService := fga.FGAService

			if fgaService == nil {
				klog.InfoS("OpenFGA service not initialized, skipping admin permission setup")
			} else {
				// Grant admin user the admin role for dashboard
				err := fgaService.GetClient().WriteTuple(ctx, "admin", "admin", "dashboard", "dashboard")
				if err != nil {
					klog.ErrorS(err, "Failed to grant admin role to admin user in OpenFGA")
				} else {
					klog.InfoS("Successfully granted admin role to admin user in OpenFGA")
				}

				// For backward compatibility during development, also grant the admin user owner permission on "cluster1"
				// This can be removed in production
				err = fgaService.GetClient().WriteTuple(ctx, "admin", "owner", "cluster", "cluster1")
				if err != nil {
					klog.V(4).InfoS("Note: Failed to grant owner role on cluster1 to admin user", "error", err)
				} else {
					klog.V(4).InfoS("Granted owner role on cluster1 to admin user for development purposes")
				}
			}
		}
	} else {
		klog.InfoS("No admin password specified in environment, skipping admin user initialization")
	}

	return nil
}

// GetUserManager returns the user manager instance
func GetUserManager() *etcd.UserManager {
	// Use read lock for retrieving the user manager
	userManagerMutex.RLock()
	defer userManagerMutex.RUnlock()

	if !userManagerInitialized || userManager == nil {
		klog.ErrorS(nil, "User manager not initialized or nil, returning nil")
		return nil
	}
	return userManager
}

// AuthenticateUser authenticates a user with username and password
func AuthenticateUser(ctx context.Context, username, password string) (string, error) {
	userMgr := GetUserManager()
	if userMgr == nil {
		return "", fmt.Errorf("user manager not initialized")
	}

	// Verify password against etcd
	valid, err := userMgr.VerifyPassword(ctx, username, password)
	if err != nil {
		return "", fmt.Errorf("authentication failed: %v", err)
	}

	if !valid {
		return "", fmt.Errorf("invalid username or password")
	}

	// Get user details
	user, err := userMgr.GetUser(ctx, username)
	if err != nil {
		return "", fmt.Errorf("failed to get user: %v", err)
	}

	// Generate JWT token
	return generateToken(user.Username, user.Role)
}

// ValidateToken validates a JWT token
func ValidateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}

	// Parse the token with our custom Claims type
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		// Validate the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	// If we're using MapClaims format (with service account info), handle that format
	if err != nil && err.Error() == "token is malformed" {
		// Try parsing as MapClaims instead
		mapClaims := jwt.MapClaims{}
		token, err = jwt.ParseWithClaims(tokenString, &mapClaims, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return jwtSecret, nil
		})

		if err != nil {
			return nil, err
		}

		if !token.Valid {
			return nil, fmt.Errorf("invalid token")
		}

		// Extract username and role from MapClaims
		if username, ok := mapClaims["username"].(string); ok {
			claims.Username = username
		}

		if role, ok := mapClaims["role"].(string); ok {
			claims.Role = role
		}

		return claims, nil
	}

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}

// generateToken generates a JWT token for a user
func generateToken(username, role string) (string, error) {
	now := time.Now()
	claims := &Claims{
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenExpiryDuration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "karmada-dashboard-api",
			Subject:   username,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// getJWTSecret returns the JWT secret from environment or a default value
func getJWTSecret() string {
	secret := os.Getenv("KARMADA_DASHBOARD_JWT_SECRET")
	if secret == "" {
		// In production, you should set a secure secret via environment variable
		secret = "default-karmada-dashboard-secret-key"
		klog.InfoS("Using default JWT secret. This is not secure for production. Set KARMADA_DASHBOARD_JWT_SECRET environment variable.")
	}
	return secret
}
