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
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/openfga/go-sdk/client"
	"k8s.io/klog/v2"
)

// Client is an interface for interacting with OpenFGA
type Client interface {
	// Check determines if a user has a particular relation with an object
	Check(ctx context.Context, user, relation, objectType, objectID string) (bool, error)
	// GetStoreID returns the OpenFGA store ID
	GetStoreID() string
	// GetAuthModelID returns the OpenFGA authorization model ID
	GetAuthModelID() string
	// WriteTuple writes a tuple to OpenFGA
	WriteTuple(ctx context.Context, user, relation, objectType, objectID string) error
	// DeleteTuple deletes a tuple from OpenFGA
	DeleteTuple(ctx context.Context, user, relation, objectType, objectID string) error
}

// OpenFGAClient implements the Client interface using OpenFGA
type OpenFGAClient struct {
	storeID     string
	authModelID string
	fgaClient   *client.OpenFgaClient
}

// NewOpenFGAClient creates a new OpenFGA client with the given configuration
func NewOpenFGAClient(apiURL string) (*OpenFGAClient, error) {
	if apiURL == "" {
		return nil, fmt.Errorf("OpenFGA API URL cannot be empty")
	}

	klog.InfoS("Initializing OpenFGA client", "apiURL", apiURL)

	// Ensure URL has a scheme
	parsedURL, err := url.Parse(apiURL)
	if err != nil {
		return nil, fmt.Errorf("invalid OpenFGA API URL: %w", err)
	}

	if parsedURL.Scheme == "" {
		apiURL = "http://" + apiURL
		klog.InfoS("Added http:// scheme to URL", "updatedUrl", apiURL)
	}

	// For compatibility, store the well-formatted URL
	formattedURL := apiURL

	// Initialize the OpenFGA client with the full URL
	clientConfig := client.ClientConfiguration{
		ApiUrl: formattedURL,
	}

	klog.InfoS("Creating OpenFGA client", "apiUrl", formattedURL)
	fgaClient, err := client.NewSdkClient(&clientConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create OpenFGA client: %w", err)
	}

	// Default store ID
	storeID := "ml-platform-admin"
	authModelID := ""

	c := &OpenFGAClient{
		storeID:     storeID,
		authModelID: authModelID,
		fgaClient:   fgaClient,
	}

	// Initialize the store and authorization model
	if err := c.initializeStore(context.Background(), formattedURL); err != nil {
		return nil, fmt.Errorf("failed to initialize OpenFGA store: %w", err)
	}

	return c, nil
}

// initializeStore ensures the store exists and creates the authorization model
func (c *OpenFGAClient) initializeStore(ctx context.Context, apiURL string) error {
	// Check if the store exists, create it if it doesn't
	response, err := c.fgaClient.ListStores(ctx).Execute()
	if err != nil {
		return fmt.Errorf("failed to list OpenFGA stores: %w", err)
	}

	storeExists := false
	for _, store := range response.GetStores() {
		if store.GetName() == c.storeID {
			c.storeID = store.GetId()
			storeExists = true
			break
		}
	}

	if !storeExists {
		// Create a new store
		createStoreRequest := client.ClientCreateStoreRequest{
			Name: c.storeID,
		}

		createStoreResponse, err := c.fgaClient.CreateStore(ctx).Body(createStoreRequest).Execute()
		if err != nil {
			return fmt.Errorf("failed to create OpenFGA store: %w", err)
		}

		c.storeID = createStoreResponse.GetId()
		klog.InfoS("Created OpenFGA store", "storeID", c.storeID)
	}

	klog.InfoS("Re-initializing OpenFGA client with store ID", "storeID", c.storeID, "apiUrl", apiURL)

	// Create a new client with the store ID using the full URL
	newClient, err := client.NewSdkClient(&client.ClientConfiguration{
		ApiUrl:  apiURL,
		StoreId: c.storeID,
	})

	if err != nil {
		return fmt.Errorf("failed to create OpenFGA client with store ID: %w", err)
	}

	// Update the client
	c.fgaClient = newClient

	// Create basic authorization model for Karmada Dashboard if it doesn't exist
	if c.authModelID == "" {
		if err := c.createAuthorizationModel(ctx); err != nil {
			return err
		}
	}

	return nil
}

// createAuthorizationModel creates a minimal authorization model for Karmada Dashboard
func (c *OpenFGAClient) createAuthorizationModel(ctx context.Context) error {
	minimalModel := `{
  "schema_version": "1.1",
  "type_definitions": [
    {
      "type": "user"
    },
    {
      "type": "dashboard",
      "relations": {
        "admin": {
          "this": {}
        },
        "basic_user": {
          "this": {}
        }
      },
	  "metadata": {
        "relations": {
          "admin": {
            "directly_related_user_types": [
              {
                "type": "user"
              }
            ]
          },
          "basic_user": {
            "directly_related_user_types": [
              {
                "type": "user"
              }
            ]
          }
        }
      }
    },
    {
      "type": "cluster",
      "relations": {
        "owner": {
          "this": {}
        },
        "member": {
          "this": {}
        }
      },
	  "metadata": {
        "relations": {
          "owner": {
            "directly_related_user_types": [
              {
                "type": "user"
              }
            ]
          },
          "member": {
            "directly_related_user_types": [
              {
                "type": "user"
              }
            ]
          }
        }
      }
    }
  ]
}`

	apiURL := c.fgaClient.GetConfig().ApiUrl
	if apiURL == "" {
		apiURL = fmt.Sprintf("%s://%s", c.fgaClient.GetConfig().ApiScheme, c.fgaClient.GetConfig().ApiHost)
	}

	storeURL := fmt.Sprintf("%s/stores/%s/authorization-models", apiURL, c.storeID)
	klog.InfoS("Creating authorization model", "url", storeURL)

	var body client.ClientWriteAuthorizationModelRequest
	if err := json.Unmarshal([]byte(minimalModel), &body); err != nil {
		return fmt.Errorf("failed to unmarshal authorization model: %w", err)
	}

	_, err := c.fgaClient.WriteAuthorizationModel(context.Background()).Body(body).Execute()
	if err != nil {
		return fmt.Errorf("failed to write authorization model: %w", err)
	}

	return nil
}

// Check determines if a user has a particular relation with an object
func (c *OpenFGAClient) Check(ctx context.Context, user, relation, objectType, objectID string) (bool, error) {
	params := client.ClientCheckRequest{
		User:     fmt.Sprintf("%s:%s", "user", user),
		Relation: relation,
		Object:   fmt.Sprintf("%s:%s", objectType, objectID),
	}

	response, err := c.fgaClient.Check(ctx).Body(params).Execute()
	if err != nil {
		return false, fmt.Errorf("OpenFGA check error: %w", err)
	}

	return response.GetAllowed(), nil
}

// WriteTuple writes a tuple to OpenFGA
func (c *OpenFGAClient) WriteTuple(ctx context.Context, user, relation, objectType, objectID string) error {
	klog.V(4).InfoS("Writing tuple", "user", user, "relation", relation, "objectType", objectType, "objectID", objectID)

	// Format user and object according to OpenFGA requirements
	formattedUser := fmt.Sprintf("user:%s", user)
	formattedObject := fmt.Sprintf("%s:%s", objectType, objectID)

	// Create the tuple to write
	tupleKey := client.ClientTupleKey{
		User:     formattedUser,
		Relation: relation,
		Object:   formattedObject,
	}

	// Create the write request with the tuple
	writeRequest := client.ClientWriteRequest{
		Writes: []client.ClientTupleKey{tupleKey},
	}

	// Execute the write request
	_, err := c.fgaClient.Write(ctx).Body(writeRequest).Execute()
	if err != nil {
		return fmt.Errorf("failed to write tuple: %w", err)
	}

	klog.V(4).InfoS("Successfully wrote tuple", "user", user, "relation", relation, "objectType", objectType, "objectID", objectID)
	return nil
}

// DeleteTuple deletes a tuple from OpenFGA
func (c *OpenFGAClient) DeleteTuple(ctx context.Context, user, relation, objectType, objectID string) error {
	klog.V(4).InfoS("Deleting tuple", "user", user, "relation", relation, "objectType", objectType, "objectID", objectID)

	// Format user and object according to OpenFGA requirements
	formattedUser := fmt.Sprintf("user:%s", user)
	formattedObject := fmt.Sprintf("%s:%s", objectType, objectID)

	// Create the tuple to delete (without condition since we're dealing with a simple tuple)
	tupleKey := client.ClientTupleKeyWithoutCondition{
		User:     formattedUser,
		Relation: relation,
		Object:   formattedObject,
	}

	// Create the delete request with the tuple
	deleteRequest := client.ClientWriteRequest{
		Deletes: []client.ClientTupleKeyWithoutCondition{tupleKey},
	}

	// Execute the delete request
	_, err := c.fgaClient.Write(ctx).Body(deleteRequest).Execute()
	if err != nil {
		return fmt.Errorf("failed to delete tuple: %w", err)
	}

	klog.V(4).InfoS("Successfully deleted tuple", "user", user, "relation", relation, "objectType", objectType, "objectID", objectID)
	return nil
}

// GetStoreID returns the OpenFGA store ID
func (c *OpenFGAClient) GetStoreID() string {
	return c.storeID
}

// GetAuthModelID returns the OpenFGA authorization model ID
func (c *OpenFGAClient) GetAuthModelID() string {
	return c.authModelID
}
