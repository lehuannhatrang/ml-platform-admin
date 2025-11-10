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
	"os"
)

// Config holds the Keycloak configuration
type Config struct {
	URL          string // Keycloak server URL (e.g., http://keycloak.ml-platform-system.svc:8080)
	Realm        string // Keycloak realm name
	ClientID     string // Client ID
	ClientSecret string // Client secret (optional for public clients)
}

// GetConfig returns the Keycloak configuration from environment variables
func GetConfig() *Config {
	env := os.Getenv("ENV_NAME")
	if env == "" {
		env = "prod"
	}

	var realm string
	if env == "dev" {
		realm = "ml-platform-dev"
	} else {
		realm = "ml-platform"
	}

	return &Config{
		URL:          getEnvOrDefault("KEYCLOAK_URL", "http://keycloak.ml-platform-system.svc:8080"),
		Realm:        getEnvOrDefault("KEYCLOAK_REALM", realm),
		ClientID:     getEnvOrDefault("KEYCLOAK_CLIENT_ID", "ml-platform-admin"),
		ClientSecret: os.Getenv("KEYCLOAK_CLIENT_SECRET"), // Optional for public clients
	}
}

// getEnvOrDefault returns environment variable value or default
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

