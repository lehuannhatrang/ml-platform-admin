#!/bin/bash
set -e

echo "=== DCN Dashboard NodePort Mode Setup ==="
echo "This script will install DCN Dashboard in NodePort mode and set up OpenFGA"
echo ""

# Set the working directory to the script's directory
cd "$(dirname "$0")"

# Step 1: Apply the NodePort overlay kustomization
echo "Step 1: Installing DCN Dashboard with NodePort configuration..."
kubectl apply -k artifacts/overlays/nodeport-mode
echo "NodePort overlay applied successfully."
echo ""

# Step 2: Wait for deployments to be ready
echo "Waiting for dashboard deployments to become ready..."
kubectl -n karmada-system wait --for=condition=available --timeout=120s deployment/karmada-dashboard-api
kubectl -n karmada-system wait --for=condition=available --timeout=120s deployment/karmada-dashboard-web
echo "Dashboard deployments are ready."
echo ""

# Step 3: Install OpenFGA using Helm
echo "Step 3: Installing OpenFGA using Helm..."

# Add OpenFGA Helm repository if not already added
if ! helm repo list | grep -q "openfga"; then
  echo "Adding OpenFGA Helm repository..."
  helm repo add openfga https://openfga.github.io/helm-charts
  helm repo update
fi

# Install OpenFGA with Helm
echo "Installing OpenFGA with PostgreSQL..."
helm install --namespace karmada-system openfga openfga/openfga \
  --set datastore.engine=postgres \
  --set datastore.uri="postgres://postgres:password@openfga-postgresql.karmada-system.svc.cluster.local:5432/postgres?sslmode=disable" \
  --set postgresql.enabled=true \
  --set postgresql.auth.postgresPassword=password \
  --set postgresql.auth.database=postgres
echo "OpenFGA installed via Helm."
echo ""

# Step 4: Apply the OpenFGA service configuration
echo "Step 4: Applying OpenFGA service configuration..."
kubectl apply -k artifacts/openfga
echo "OpenFGA service configuration applied."
echo ""

# Step 5: Wait for OpenFGA to be ready
echo "Waiting for OpenFGA deployment to become ready..."
kubectl -n karmada-system wait --for=condition=available --timeout=180s deployment/openfga
echo "OpenFGA deployment is ready."
echo ""

# Step 6: Verify OpenFGA installation
echo "Step 6: Verifying OpenFGA installation..."
./artifacts/openfga/setup-openfga.sh

# Get NodePort for dashboard web
WEB_NODEPORT=$(kubectl get svc -n karmada-system karmada-dashboard-web-nodeport -o jsonpath='{.spec.ports[0].nodePort}')
API_NODEPORT=$(kubectl get svc -n karmada-system karmada-dashboard-api-nodeport -o jsonpath='{.spec.ports[0].nodePort}')

echo ""
echo "=== DCN Dashboard Setup Complete ==="
echo "Dashboard Web UI is available at: http://<node-ip>:${WEB_NODEPORT}"
echo "Dashboard API is available at: http://<node-ip>:${API_NODEPORT}"
echo "Default credentials: admin / admin123"
echo ""
echo "NOTE: Replace <node-ip> with your Kubernetes node's external IP address."
