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

package fga

import (
	"context"
	"sync"

	"k8s.io/klog/v2"
)

var (
	// FGAService is the global OpenFGA service instance
	FGAService *Service
	// once ensures the FGA service is initialized only once
	once sync.Once
)

// Service provides access to the OpenFGA client
type Service struct {
	client Client
}

// NewService creates a new OpenFGA service
func NewService(apiURL string) (*Service, error) {
	client, err := NewOpenFGAClient(apiURL)
	if err != nil {
		return nil, err
	}

	return &Service{client: client}, nil
}

// InitFGAService initializes the global FGA service
func InitFGAService(apiURL string) error {
	var initErr error

	once.Do(func() {
		service, err := NewService(apiURL)
		if err != nil {
			initErr = err
			return
		}

		FGAService = service
		klog.InfoS("FGA service initialized successfully")
	})

	return initErr
}

// GetClient returns the OpenFGA client
func (s *Service) GetClient() Client {
	return s.client
}

// Check determines if a user has a particular relation with an object
func (s *Service) Check(ctx context.Context, user, relation, objectType, objectID string) (bool, error) {
	return s.client.Check(ctx, user, relation, objectType, objectID)
}
