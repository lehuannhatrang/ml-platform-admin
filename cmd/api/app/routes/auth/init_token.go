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
	"net/http"
	"time"

	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/etcd"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/klog/v2"
)

// initToken validates and stores a Karmada API server service account token
func initToken(spec *v1.InitTokenRequest, request *http.Request) (*v1.InitTokenResponse, int, error) {
	// Validate the token by trying to use it with the Karmada API server
	err := validateToken(spec.Token)
	if err != nil {
		klog.ErrorS(err, "Failed to validate service account token")
		return &v1.InitTokenResponse{
			Success: false,
			Message: "Invalid token: " + err.Error(),
		}, http.StatusBadRequest, nil
	}

	// Token is valid, save it to etcd
	err = saveTokenToEtcd(request.Context(), spec.Token)
	if err != nil {
		klog.ErrorS(err, "Failed to save service account token to etcd")
		return &v1.InitTokenResponse{
			Success: false,
			Message: "Failed to save token: " + err.Error(),
		}, http.StatusInternalServerError, nil
	}

	klog.InfoS("Successfully initialized Karmada API server service account token")
	return &v1.InitTokenResponse{
		Success: true,
		Message: "Token successfully initialized and stored",
	}, http.StatusOK, nil
}

// validateToken checks if the token can be used to authenticate with the Karmada API server
func validateToken(token string) error {
	// Create a test request with authorization header
	req, err := http.NewRequest("GET", "/", nil)
	if err != nil {
		return err
	}
	
	// Set the token in the Authorization header
	req.Header.Set("Authorization", "Bearer "+token)
	
	// Try to get a Karmada client using this token
	karmadaClient, err := client.GetKarmadaClientFromRequest(req)
	if err != nil {
		return err
	}
	
	// Try to get the server version to verify connectivity and permissions
	_, err = karmadaClient.Discovery().ServerVersion()
	if err != nil {
		return err
	}
	
	return nil
}

// saveTokenToEtcd stores the service account token in etcd
func saveTokenToEtcd(ctx context.Context, token string) error {
	// Create a timeout context
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	
	// Get the etcd client
	etcdClient, err := etcd.GetEtcdClient(nil)
	if err != nil || etcdClient == nil {
		return apierrors.NewInternalError(err)
	}
	
	// Store the token in etcd with the key "karmada-dashboard/service-account-token"
	key := ServiceAccountTokenKey
	_, err = etcdClient.Put(ctx, key, token)
	
	return err
}

// Constants for service account token storage
const (
	// ServiceAccountTokenKey is the key used to store the token in etcd
	ServiceAccountTokenKey = "karmada-dashboard/service-account-token"
)
