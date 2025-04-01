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
	"github.com/karmada-io/dashboard/pkg/auth"
	"github.com/karmada-io/dashboard/pkg/common/errors"
	"k8s.io/klog/v2"
)

func login(spec *v1.LoginRequest, request *http.Request) (*v1.LoginResponse, int, error) {
	// If username and password are provided, use password authentication
	if spec.Username != "" && spec.Password != "" {
		ctx, cancel := context.WithTimeout(request.Context(), 5*time.Second)
		defer cancel()

		token, err := auth.AuthenticateUser(ctx, spec.Username, spec.Password)
		if err != nil {
			klog.ErrorS(err, "Authentication failed", "username", spec.Username)
			return nil, http.StatusUnauthorized, errors.NewUnauthorized("Invalid username or password")
		}

		return &v1.LoginResponse{Token: token}, http.StatusOK, nil
	}

	return nil, http.StatusBadRequest, errors.NewBadRequest("No valid authentication method provided")
}
