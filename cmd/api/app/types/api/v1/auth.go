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

package v1

// LoginRequest is the request for login.
type LoginRequest struct {
	// Token is the bearer token for authentication
	Token string `json:"token"`
	// Username for password-based authentication
	Username string `json:"username,omitempty"`
	// Password for password-based authentication
	Password string `json:"password,omitempty"`
}

// LoginResponse is the response for login.
type LoginResponse struct {
	Token string `json:"token"`
	// Username of the authenticated user
	Username string `json:"username,omitempty"`
	// Role of the authenticated user
	Role string `json:"role,omitempty"`
}

// User is the user info.
type User struct {
	Name          string `json:"name,omitempty"`
	Authenticated bool   `json:"authenticated"`
	Role          string `json:"role,omitempty"`
	InitToken     bool   `json:"initToken"`
}

// ServiceAccount is the service account info.
type ServiceAccount struct {
	Name string `json:"name"`
	UID  string `json:"uid"`
}

// InitTokenRequest represents a request to initialize a service account token
type InitTokenRequest struct {
	// Token is the Karmada API server service account token
	Token string `json:"token" validate:"required"`
}

// InitTokenResponse represents a response to initialize token request
type InitTokenResponse struct {
	// Success indicates whether the token was successfully initialized
	Success bool `json:"success"`
	// Message provides additional information about the operation
	Message string `json:"message,omitempty"`
}
