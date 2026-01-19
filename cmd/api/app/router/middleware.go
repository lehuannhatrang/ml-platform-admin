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

package router

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/auth/fga"
	"github.com/karmada-io/dashboard/pkg/auth/keycloak"
	"github.com/karmada-io/dashboard/pkg/client"
	utilauth "github.com/karmada-io/dashboard/pkg/util/utilauth"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"
)

// ResolveClusterName resolves a cluster name to the actual cluster name.
// This handles:
// - Single-cluster mode: maps any cluster name to local-cluster (or configured name)
// - Aliased names: maps "mgmt-cluster" and other local aliases appropriately
// - Returns the resolved cluster name and whether it's the local cluster
func ResolveClusterName(clusterName string) (resolvedName string, isLocalCluster bool, err error) {
	// Get the effective local cluster name (may be configured)
	localName := client.GetLocalClusterName()
	
	// If Karmada is not enabled, all requests go to the local cluster
	if !client.IsKarmadaEnabled() {
		// In single-cluster mode, accept any cluster name but route to local cluster
		// This allows flexibility for users to use any name in URLs
		return localName, true, nil
	}
	
	// When Karmada is enabled, check for local cluster aliases
	if client.IsLocalClusterName(clusterName) {
		return localName, true, nil
	}
	
	// Return the original cluster name for Karmada member clusters
	return clusterName, false, nil
}

// EnsureMemberClusterMiddleware ensures that the member cluster exists.
// It also resolves cluster name aliases and handles single-cluster mode.
func EnsureMemberClusterMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestedCluster := c.Param("clustername")
		
		// Resolve the cluster name (handles aliasing and single-cluster mode)
		resolvedCluster, isLocalCluster, err := ResolveClusterName(requestedCluster)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusOK, common.BaseResponse{
				Code: 500,
				Msg:  err.Error(),
			})
			return
		}
		
		// Store the resolved cluster name in the context for use by handlers
		c.Set("resolvedClusterName", resolvedCluster)
		c.Set("isLocalCluster", isLocalCluster)
		
		// If it's a local cluster, no need to verify with Karmada
		if isLocalCluster {
			c.Next()
			return
		}
		
		// If Karmada is enabled and it's a member cluster, verify it exists
		karmadaClient := client.InClusterKarmadaClient()
		if karmadaClient == nil {
			c.AbortWithStatusJSON(http.StatusOK, common.BaseResponse{
				Code: 500,
				Msg:  "Karmada client not available",
			})
			return
		}
		
		_, err = karmadaClient.ClusterV1alpha1().Clusters().Get(context.TODO(), resolvedCluster, metav1.GetOptions{})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusOK, common.BaseResponse{
				Code: 500,
				Msg:  err.Error(),
			})
			return
		}
		c.Next()
	}
}

// EnsureMgmtAdminMiddleware ensures that the user is a dashboard admin.
func EnsureMgmtAdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get the current username using our auth utility
		username := utilauth.GetAuthenticatedUser(c)
		if username == "" {
			klog.InfoS("No authenticated user for management cluster access")
			c.AbortWithStatusJSON(http.StatusOK, common.BaseResponse{
				Code: 401,
				Msg:  "Authentication required for management cluster access",
			})
			return
		}

		var isAdmin bool
		var err error

		// Check if Keycloak is available
		if kc := keycloak.GetClient(); kc != nil {
			klog.V(4).InfoS("Using Keycloak for admin authorization", "username", username)
			
			// Get user roles from context (set by GetAuthenticatedUser)
			rolesInterface, exists := c.Get("user_roles")
			if exists {
				if roles, ok := rolesInterface.([]string); ok {
					// Check for admin or dashboard-admin role
					for _, role := range roles {
						if strings.EqualFold(role, "admin") || strings.EqualFold(role, "dashboard-admin") {
							isAdmin = true
							break
						}
					}
				}
			}
			
			if !isAdmin {
				// Fallback: check token directly
				token := client.GetBearerToken(c.Request)
				if token != "" {
					isAdmin, err = kc.HasRole(context.TODO(), token, "admin")
					if err == nil && !isAdmin {
						isAdmin, err = kc.HasRole(context.TODO(), token, "dashboard-admin")
					}
				}
			}
		} else {
			// Use OpenFGA if Keycloak is not available
			klog.V(4).InfoS("Using OpenFGA for admin authorization", "username", username)
			
			if fga.FGAService == nil || fga.FGAService.GetClient() == nil {
				klog.ErrorS(nil, "Authorization service not available")
				c.AbortWithStatusJSON(http.StatusOK, common.BaseResponse{
					Code: 500,
					Msg:  "Authorization service unavailable",
				})
				return
			}

			// Check if user is dashboard admin in OpenFGA
			isAdmin, err = fga.FGAService.GetClient().Check(context.TODO(), username, "admin", "dashboard", "dashboard")
		}

		if err != nil {
			klog.ErrorS(err, "Failed to check if user is admin", "username", username)
			c.AbortWithStatusJSON(http.StatusOK, common.BaseResponse{
				Code: 500,
				Msg:  "Failed to verify administrator permissions",
			})
			return
		}

		if !isAdmin {
			klog.InfoS("User is not admin", "username", username)
			c.AbortWithStatusJSON(http.StatusOK, common.BaseResponse{
				Code: 403,
				Msg:  "Administrator permissions required for management cluster access",
			})
			return
		}

		// User is admin, continue
		klog.V(4).InfoS("User is admin, allowing management cluster access", "username", username)
		c.Next()
	}
}
