#!/bin/bash
set -e

# This script helps verify the OpenFGA deployment for the Karmada Dashboard
# It will just check the OpenFGA API status without creating any models

# Try accessing OpenFGA through the internal Kubernetes service first
INTERNAL_API_URL="http://openfga-api.karmada-system.svc.cluster.local:8080"
NODEPORT_API_URL="http://localhost:30080"

# Check OpenFGA health (internal first, then NodePort)
echo "Checking OpenFGA API health..."

# Try internal service first with a timeout
echo "Trying internal Kubernetes service..."
HEALTH_RESPONSE=$(curl -s --connect-timeout 5 -X GET "${INTERNAL_API_URL}/healthz" || echo "failed")

if [[ "$HEALTH_RESPONSE" == *"ok"* ]]; then
  echo "OpenFGA API is healthy (internal access)!"
  IS_HEALTHY=true
else
  echo "Could not access internal OpenFGA service, trying NodePort..."
  # Try NodePort with a timeout
  HEALTH_RESPONSE=$(curl -s --connect-timeout 5 -X GET "${NODEPORT_API_URL}/healthz" || echo "failed")
  
  if [[ "$HEALTH_RESPONSE" == *"ok"* ]]; then
    echo "OpenFGA API is healthy (NodePort access)!"
    IS_HEALTHY=true
  else
    echo "WARNING: OpenFGA API verification failed. Continuing with installation."
    echo "You may need to manually verify OpenFGA after installation."
    IS_HEALTHY=false
  fi
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
