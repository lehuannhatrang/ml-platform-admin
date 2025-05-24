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

	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/auth/fga"
	"github.com/karmada-io/dashboard/pkg/client"
	utilauth "github.com/karmada-io/dashboard/pkg/util/utilauth"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"
)

// EnsureMemberClusterMiddleware ensures that the member cluster exists.
func EnsureMemberClusterMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		karmadaClient := client.InClusterKarmadaClient()
		_, err := karmadaClient.ClusterV1alpha1().Clusters().Get(context.TODO(), c.Param("clustername"), metav1.GetOptions{})
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

		// Check if OpenFGA service is available
		if fga.FGAService == nil || fga.FGAService.GetClient() == nil {
			klog.ErrorS(nil, "OpenFGA service not available for admin check")
			c.AbortWithStatusJSON(http.StatusOK, common.BaseResponse{
				Code: 500,
				Msg:  "Authorization service unavailable",
			})
			return
		}

		// Check if user is dashboard admin
		isAdmin, err := fga.FGAService.GetClient().Check(context.TODO(), username, "admin", "dashboard", "dashboard")
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
