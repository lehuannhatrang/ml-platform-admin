#!/bin/bash

# Setup script for Cloud Credentials and ClusterAPI integration
# This script sets up the necessary Kubernetes resources

set -e

echo "=================================="
echo "ML Platform Cloud Credentials Setup"
echo "=================================="
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed or not in PATH"
    exit 1
fi

# Check cluster connectivity
if ! kubectl cluster-info &> /dev/null; then
    echo "Error: Cannot connect to Kubernetes cluster"
    exit 1
fi

echo "✓ kubectl is available and connected to cluster"
echo ""

# Create namespace
echo "Creating ml-platform-system namespace..."
if kubectl get namespace ml-platform-system &> /dev/null; then
    echo "✓ Namespace ml-platform-system already exists"
else
    kubectl apply -f "$(dirname "$0")/../artifacts/ml-platform-system-namespace.yaml"
    echo "✓ Namespace ml-platform-system created"
fi
echo ""

# Check if ClusterAPI is installed
echo "Checking ClusterAPI installation..."
if kubectl get crd clusters.cluster.x-k8s.io &> /dev/null; then
    echo "✓ ClusterAPI is installed"
    
    # List installed providers
    echo ""
    echo "Installed ClusterAPI providers:"
    kubectl get providers -A 2>/dev/null || echo "  (Unable to list providers)"
else
    echo "⚠ ClusterAPI is NOT installed"
    echo ""
    echo "To install ClusterAPI, run:"
    echo "  # Install clusterctl"
    echo "  curl -L https://github.com/kubernetes-sigs/cluster-api/releases/download/v1.5.0/clusterctl-linux-amd64 -o clusterctl"
    echo "  chmod +x clusterctl"
    echo "  sudo mv clusterctl /usr/local/bin/"
    echo ""
    echo "  # Initialize ClusterAPI with your provider (e.g., AWS)"
    echo "  export AWS_REGION=us-east-1"
    echo "  export AWS_ACCESS_KEY_ID=<your-access-key>"
    echo "  export AWS_SECRET_ACCESS_KEY=<your-secret-key>"
    echo "  clusterctl init --infrastructure aws"
    echo ""
fi

# Check dashboard API deployment
echo ""
echo "Checking Karmada Dashboard API..."
if kubectl get deployment karmada-dashboard-api -n karmada-system &> /dev/null; then
    echo "✓ Karmada Dashboard API is deployed"
    
    # Check if API pod is running
    POD_STATUS=$(kubectl get pods -n karmada-system -l app=karmada-dashboard-api -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "NotFound")
    if [ "$POD_STATUS" = "Running" ]; then
        echo "✓ Dashboard API pod is running"
    else
        echo "⚠ Dashboard API pod status: $POD_STATUS"
    fi
else
    echo "⚠ Karmada Dashboard API is not deployed"
fi

echo ""
echo "=================================="
echo "Setup Summary"
echo "=================================="
echo ""
echo "Namespace: ml-platform-system"
echo "  kubectl get namespace ml-platform-system"
echo ""
echo "Cloud Credentials (Secrets):"
echo "  kubectl get secrets -n ml-platform-system -l ml-platform.io/credential-type=cloud-credential"
echo ""
echo "ClusterAPI Clusters:"
echo "  kubectl get clusters -n ml-platform-system"
echo ""
echo "=================================="
echo "Next Steps"
echo "=================================="
echo ""
echo "1. Access the Dashboard UI"
echo "   - Navigate to: Infra Manage > Cloud Credentials"
echo "   - Add your first cloud credential"
echo ""
echo "2. Create a cluster using ClusterAPI"
echo "   - Navigate to: Infra Manage > Cluster Manage"
echo "   - Click 'Add Cluster'"
echo "   - Select 'Create New Cluster (ClusterAPI)'"
echo "   - Fill in the details and submit"
echo ""
echo "3. Monitor cluster creation"
echo "   kubectl get clusters -n ml-platform-system -w"
echo ""
echo "For more information, see:"
echo "  CLOUD_CREDENTIALS_CAPI_IMPLEMENTATION.md"
echo ""




