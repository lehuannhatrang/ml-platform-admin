#!/bin/bash
set -e

# This script helps set up OpenFGA for the Karmada Dashboard
# It will create a store, define an authorization model, and update the dashboard configuration

# OpenFGA API URL
OPENFGA_API_URL="http://localhost:30080"

# Create OpenFGA store
echo "Creating OpenFGA store..."
STORE_RESPONSE=$(curl -s -X POST \
  "${OPENFGA_API_URL}/stores" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "karmada-dashboard"
  }')

STORE_ID=$(echo $STORE_RESPONSE | grep -o '"id":"[^"]*"' | sed 's/"id":"//;s/"$//')

if [ -z "$STORE_ID" ]; then
  echo "Failed to create store or parse store ID"
  exit 1
fi

echo "Store created with ID: $STORE_ID"

# Create authorization model
echo "Creating authorization model..."
# Define a basic authorization model for Karmada dashboard
AUTH_MODEL_JSON='{
  "type_definitions": [
    {
      "type": "user",
      "relations": {
        "administrator": {
          "this": {}
        }
      }
    },
    {
      "type": "cluster",
      "relations": {
        "reader": {
          "union": {
            "child": [
              {
                "this": {}
              },
              {
                "tupleToUserset": {
                  "tupleset": {
                    "object": "cluster",
                    "relation": "admin"
                  },
                  "computedUserset": {
                    "object": ""
                  }
                }
              }
            ]
          }
        },
        "admin": {
          "union": {
            "child": [
              {
                "this": {}
              },
              {
                "computedUserset": {
                  "object": "user",
                  "relation": "administrator"
                }
              }
            ]
          }
        }
      }
    },
    {
      "type": "resource",
      "relations": {
        "reader": {
          "union": {
            "child": [
              {
                "this": {}
              },
              {
                "tupleToUserset": {
                  "tupleset": {
                    "object": "resource",
                    "relation": "admin"
                  },
                  "computedUserset": {
                    "object": ""
                  }
                }
              },
              {
                "tupleToUserset": {
                  "tupleset": {
                    "object": "resource",
                    "relation": "cluster"
                  },
                  "computedUserset": {
                    "object": "",
                    "relation": "reader"
                  }
                }
              }
            ]
          }
        },
        "admin": {
          "union": {
            "child": [
              {
                "this": {}
              },
              {
                "computedUserset": {
                  "object": "user",
                  "relation": "administrator"
                }
              }
            ]
          }
        },
        "cluster": {
          "this": {}
        }
      }
    }
  ]
}'

AUTH_MODEL_RESPONSE=$(curl -s -X POST \
  "${OPENFGA_API_URL}/stores/${STORE_ID}/authorization-models" \
  -H "Content-Type: application/json" \
  -d "$AUTH_MODEL_JSON")

AUTH_MODEL_ID=$(echo $AUTH_MODEL_RESPONSE | grep -o '"authorization_model_id":"[^"]*"' | sed 's/"authorization_model_id":"//;s/"$//')

if [ -z "$AUTH_MODEL_ID" ]; then
  echo "Failed to create authorization model or parse authorization model ID"
  exit 1
fi

echo "Authorization model created with ID: $AUTH_MODEL_ID"

# Print information for updating dashboard configuration
echo ""
echo "OpenFGA is now configured successfully!"
echo ""
echo "Please update your dashboard configuration in artifacts/overlays/nodeport-mode/dashboard-config.yaml with the following values:"
echo ""
echo "authorization:"
echo "  type: \"openfga\""
echo "  openfga:"
echo "    api_url: \"http://openfga-api.karmada-system.svc.cluster.local:8080\""
echo "    store_id: \"${STORE_ID}\"  # Add this store ID"
echo "    authorization_model_id: \"${AUTH_MODEL_ID}\"  # Add this authorization model ID"
echo ""
echo "After updating the configuration, you can apply the changes with:"
echo "kubectl apply -k artifacts/overlays/nodeport-mode"
