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
  echo "=== ML Platform NodePort Mode Setup ==="
  echo "This script will install ML Platform Admin in NodePort mode (single-cluster)"
  echo ""
  
  # Set the working directory to the script's directory
  cd "$(dirname "$0")"
  
  # Check if kubectl is available
  echo "Checking if kubectl is installed..."
  if ! command -v kubectl &> /dev/null; then
    echo "kubectl is not installed. Please install kubectl first."
    exit 1
  fi
  echo "kubectl is available."
  echo ""
  
  # Check if the cluster is accessible
  echo "Checking cluster connectivity..."
  if ! kubectl cluster-info &> /dev/null; then
    echo "Cannot connect to Kubernetes cluster. Please ensure your kubeconfig is properly configured."
    exit 1
  fi
  echo "Cluster is accessible."
  echo ""
  
  # Step 1: Create namespace ml-platform-system if it doesn't exist
  echo "Step 1: Creating namespace ml-platform-system..."
  kubectl create namespace ml-platform-system --dry-run=client -o yaml | kubectl apply -f -
  echo "Namespace ml-platform-system created."
  echo ""
  
  # Step 2: Create kubeconfig secret for local cluster access
  echo "Step 2: Creating kubeconfig secret..."
  if kubectl get secret kubeconfig -n ml-platform-system &>/dev/null; then
    echo "Secret 'kubeconfig' already exists. Skipping creation."
  else
    echo "Creating 'kubeconfig' secret from current kubeconfig..."
    kubectl create secret generic kubeconfig --from-file=kubeconfig=$HOME/.kube/config -n ml-platform-system
    echo "Kubeconfig secret created."
  fi
  echo ""

  # Step 3: Apply the NodePort overlay kustomization
  echo "Step 3: Installing ML Platform with NodePort configuration..."
  kubectl apply -k artifacts/overlays/nodeport-mode
  echo "NodePort overlay applied successfully."
  echo ""

  # Step 4: Wait for dashboard deployments to be ready
  echo "Step 4: Waiting for dashboard deployments to become ready..."
  echo "This may take a few minutes..."
  
  # Wait for API deployment
  echo "Waiting for ml-platform-admin-api..."
  kubectl -n ml-platform-system wait --for=condition=available --timeout=300s deployment/ml-platform-admin-api || {
    echo "Warning: API deployment not ready within timeout. Checking status..."
    kubectl -n ml-platform-system get pods -l app=ml-platform-admin-api
  }
  
  # Wait for Web deployment
  echo "Waiting for ml-platform-admin-web..."
  kubectl -n ml-platform-system wait --for=condition=available --timeout=300s deployment/ml-platform-admin-web || {
    echo "Warning: Web deployment not ready within timeout. Checking status..."
    kubectl -n ml-platform-system get pods -l app=ml-platform-admin-web
  }
  
  echo "Dashboard deployments are ready."
  echo ""

  # Get NodePort for dashboard web
  WEB_NODEPORT=$(kubectl get svc -n ml-platform-system ml-platform-admin-web -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "unknown")
  API_NODEPORT=$(kubectl get svc -n ml-platform-system ml-platform-admin-api -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "unknown")

  # Get cluster name
  CLUSTER_NAME=$(kubectl config current-context 2>/dev/null || echo "local-cluster")

  echo ""
  echo "=== ML Platform Setup Complete ==="
  echo ""
  echo "Dashboard Web UI: http://<node-ip>:${WEB_NODEPORT}"
  echo "API Server:       http://<node-ip>:${API_NODEPORT}"
  echo ""
  echo "Current Cluster:  ${CLUSTER_NAME}"
  echo ""
  echo "Default credentials: admin / admin123"
  echo ""
  echo "NOTE: Replace <node-ip> with your Kubernetes node's external IP address."
  echo ""
  echo "To get node IPs, run:"
  echo "  kubectl get nodes -o wide"
  echo ""
  echo "The platform is running in single-cluster mode."
  echo "To add multi-cluster support later, install Karmada and update the configuration."
}

# Function to uninstall all components
uninstall_all() {
  echo "=== ML Platform NodePort Mode Uninstall ==="
  echo "This will uninstall ML Platform in NodePort mode"
  echo ""
  
  # Set the working directory to the script's directory
  cd "$(dirname "$0")"
  
  # Step 1: Uninstall ML Platform NodePort overlay
  echo "Step 1: Uninstalling ML Platform NodePort configuration..."
  kubectl delete -k artifacts/overlays/nodeport-mode --ignore-not-found=true
  echo "NodePort overlay removed."
  echo ""
  
  # Step 2: Delete secrets
  echo "Step 2: Removing secrets..."
  kubectl delete secret kubeconfig -n ml-platform-system --ignore-not-found=true
  echo "Secrets removed."
  echo ""
  
  # Step 3: Optionally delete the namespace
  read -p "Do you want to delete the ml-platform-system namespace? [y/n]: " delete_ns
  if [ "$delete_ns" == "y" ] || [ "$delete_ns" == "Y" ]; then
    echo "Deleting namespace ml-platform-system..."
    kubectl delete namespace ml-platform-system --ignore-not-found=true
    echo "Namespace deleted."
  else
    echo "Namespace ml-platform-system preserved."
  fi
  echo ""
  
  echo "=== ML Platform Uninstall Complete ==="
  echo "All components have been successfully removed."
}

# Main execution logic
if [ "$UNINSTALL" = true ]; then
  uninstall_all
else
  install_all
fi
