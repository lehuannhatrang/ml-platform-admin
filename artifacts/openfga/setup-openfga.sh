#!/bin/bash
set -e

# This script helps verify the OpenFGA deployment for the Karmada Dashboard
# It will just check the OpenFGA API status without creating any models

# OpenFGA API URL
OPENFGA_API_URL="http://localhost:30080"

# Check OpenFGA health
echo "Checking OpenFGA API health..."
HEALTH_RESPONSE=$(curl -s -X GET "${OPENFGA_API_URL}/healthz")

if [[ "$HEALTH_RESPONSE" == *"ok"* ]]; then
  echo "OpenFGA API is healthy!"
else
  echo "OpenFGA API is not responding correctly. Please check your deployment."
  exit 1
fi

# Print information for updating dashboard configuration
echo ""
echo "OpenFGA is now installed successfully!"
echo ""
echo "Next Steps:"
echo "1. Create a store using the OpenFGA API or Playground UI at http://<node-ip>:30082"
echo "2. Create an authorization model appropriate for your access control needs"
echo "3. Update your dashboard configuration in artifacts/overlays/nodeport-mode/dashboard-config.yaml with:"
echo ""
echo "authorization:"
echo "  type: \"openfga\""
echo "  openfga:"
echo "    api_url: \"http://openfga-api.karmada-system.svc.cluster.local:8080\""
echo "    store_id: \"<your-store-id>\""
echo "    authorization_model_id: \"<your-model-id>\""
echo ""
echo "4. Apply the updated configuration with:"
echo "   kubectl apply -k artifacts/overlays/nodeport-mode"
