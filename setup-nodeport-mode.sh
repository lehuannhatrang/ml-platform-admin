#!/bin/bash
set -e

# Parse command line arguments
UNINSTALL=false

for arg in "$@"; do
  case $arg in
    --uninstall)
      UNINSTALL=true
      shift
      ;;
    *)
      # Unknown option
      ;;
  esac
done

# Function to install all components
install_all() {
  echo "=== DCN Dashboard NodePort Mode Setup ==="
  echo "This script will install DCN Dashboard in NodePort mode and set up OpenFGA"
  echo ""
  
  # Set the working directory to the script's directory
  cd "$(dirname "$0")"
  
  # Step 1: Install OpenFGA using Helm
echo "Step 1: Installing OpenFGA using Helm..."

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

  # Step 2: Apply the OpenFGA service configuration
  echo "Step 2: Applying OpenFGA service configuration..."
  kubectl apply -k artifacts/openfga
  echo "OpenFGA service configuration applied."
  echo ""

  # Step 3: Wait for OpenFGA to be ready
  echo "Step 3: Waiting for OpenFGA deployment to become ready..."
  kubectl -n karmada-system wait --for=condition=available --timeout=300s deployment/openfga
  echo "OpenFGA deployment is ready."
  echo ""

  # Step 4: Verify OpenFGA installation
  echo "Step 4: Verifying OpenFGA installation..."
  ./artifacts/openfga/setup-openfga.sh || echo "OpenFGA verification had issues but continuing with installation..."
  echo ""

  # Step 5: Apply the NodePort overlay kustomization
  echo "Step 5: Installing DCN Dashboard with NodePort configuration..."
  kubectl apply -k artifacts/overlays/nodeport-mode
  echo "NodePort overlay applied successfully."
  echo ""

  # Step 6: Wait for dashboard deployments to be ready
  echo "Step 6: Waiting for dashboard deployments to become ready..."
  kubectl -n karmada-system wait --for=condition=available --timeout=300s deployment/karmada-dashboard-api
  kubectl -n karmada-system wait --for=condition=available --timeout=300s deployment/karmada-dashboard-web
  echo "Dashboard deployments are ready."
  echo ""

  # Step 7: Switch to karmada-apiserver context
  echo "Step 7: Switching to karmada-apiserver context..."
  kubectl config use-context karmada-apiserver
  echo "Switched to karmada-apiserver context."
  echo ""

  # Step 8: Create Service Account
  echo "Step 8: Creating dashboard service account..."
  kubectl apply -f artifacts/dashboard/karmada-dashboard-sa.yaml
  echo "Service account created."
  echo ""

  # Step 9: Get JWT token
  echo "Step 9: Retrieving JWT token..."
  JWT_TOKEN=$(kubectl -n karmada-system get secret/karmada-dashboard-secret -o go-template="{{.data.token | base64decode}}")
  echo "JWT token retrieved."
  echo ""

  # Get NodePort for dashboard web
  WEB_NODEPORT=$(kubectl get svc -n karmada-system karmada-dashboard-web -o jsonpath='{.spec.ports[0].nodePort}')

  echo ""
  echo "=== DCN Dashboard Setup Complete ==="
  echo "Dashboard Web UI is available at: http://<node-ip>:${WEB_NODEPORT}"
  echo "Default credentials: admin / admin123"
  echo ""
  echo "JWT Token for authentication:"
  echo "${JWT_TOKEN}"
  echo ""
  echo "NOTE: Replace <node-ip> with your Kubernetes node's external IP address."
}

# Function to uninstall all components
uninstall_all() {
  echo "=== DCN Dashboard NodePort Mode Uninstall ==="
  echo "This will uninstall DCN Dashboard in NodePort mode and OpenFGA"
  echo ""
  
  # Set the working directory to the script's directory
  cd "$(dirname "$0")"
  
  # Step 1: Uninstall DCN Dashboard NodePort overlay
  echo "Step 1: Uninstalling DCN Dashboard NodePort configuration..."
  kubectl delete -k artifacts/overlays/nodeport-mode --ignore-not-found=true
  echo "NodePort overlay removed."
  echo ""
  
  # Step 2: Uninstall OpenFGA service configuration
  echo "Step 2: Removing OpenFGA service configuration..."
  kubectl delete -k artifacts/openfga --ignore-not-found=true
  echo "OpenFGA service configuration removed."
  echo ""
  
  # Step 3: Uninstall OpenFGA Helm release
  echo "Step 3: Uninstalling OpenFGA Helm release..."
  helm uninstall -n karmada-system openfga --wait
  echo "OpenFGA Helm release uninstalled."
  echo ""
  
  echo "=== DCN Dashboard Uninstall Complete ==="
  echo "All components have been successfully removed."
}

# Main execution logic
if [ "$UNINSTALL" = true ]; then
  uninstall_all
else
  install_all
fi
