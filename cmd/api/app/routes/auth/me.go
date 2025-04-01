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
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
)

const (
	tokenServiceAccountKey = "serviceaccount"
)

func me(request *http.Request) (*v1.User, int, error) {
	token := client.GetBearerToken(request)
	if token == "" {
		return nil, http.StatusUnauthorized, errors.NewUnauthorized("Missing authentication token")
	}

	_, err := auth.ValidateToken(token)
	if err != nil {
		klog.ErrorS(err, "Invalid JWT token")
		return nil, http.StatusUnauthorized, errors.NewUnauthorized("Invalid authentication token")
	}

	user := getUserFromToken(token)

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
