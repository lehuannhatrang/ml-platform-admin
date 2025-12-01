#!/bin/bash
set -e

# Priority Management Deployment Script
# This script deploys the Priority Management artifacts to the Karmada control plane

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KARMADA_CONTEXT="${KARMADA_CONTEXT:-karmada-apiserver}"

echo "=========================================="
echo "Priority Management Deployment"
echo "=========================================="
echo ""
echo "Karmada Context: ${KARMADA_CONTEXT}"
echo ""

# Function to check if resource exists
resource_exists() {
    local resource_type=$1
    local resource_name=$2
    local namespace=$3
    
    if [ -n "$namespace" ]; then
        kubectl --context="${KARMADA_CONTEXT}" get "$resource_type" "$resource_name" -n "$namespace" &>/dev/null
    else
        kubectl --context="${KARMADA_CONTEXT}" get "$resource_type" "$resource_name" &>/dev/null
    fi
}

# Check if Karmada context is available
if ! kubectl config get-contexts "${KARMADA_CONTEXT}" &>/dev/null; then
    echo "Error: Karmada context '${KARMADA_CONTEXT}' not found"
    echo "Please set KARMADA_CONTEXT environment variable or ensure kubeconfig is correct"
    exit 1
fi

# Check if ml-platform-system namespace exists
if ! kubectl --context="${KARMADA_CONTEXT}" get namespace ml-platform-system &>/dev/null; then
    echo "Warning: ml-platform-system namespace does not exist"
    echo "Creating namespace..."
    kubectl --context="${KARMADA_CONTEXT}" create namespace ml-platform-system
fi

# Step 1: Install Kueue WorkloadPriorityClass CRD
echo "Step 1: Installing Kueue WorkloadPriorityClass CRD..."
if ! kubectl --context="${KARMADA_CONTEXT}" get crd workloadpriorityclasses.kueue.x-k8s.io &>/dev/null; then
    echo "  Installing CRD from local file..."
    kubectl --context="${KARMADA_CONTEXT}" apply -f "${SCRIPT_DIR}/kueue-workloadpriorityclass-crd.yaml"
    echo "✓ CRD installed"
else
    echo "  CRD already exists, skipping..."
fi
echo ""

# Step 2: Deploy WorkloadPriorityClass resources
echo "Step 2: Deploying WorkloadPriorityClass resources..."
kubectl --context="${KARMADA_CONTEXT}" apply -f "${SCRIPT_DIR}/workload-priority-classes.yaml"
echo "✓ WorkloadPriorityClass resources deployed"
echo ""

# Step 3: Deploy profile-priority ConfigMap
echo "Step 3: Deploying profile-priority ConfigMap..."
kubectl --context="${KARMADA_CONTEXT}" apply -f "${SCRIPT_DIR}/profile-priority-configmap.yaml"
echo "✓ ConfigMap deployed"
echo ""

# Step 4: Deploy CRD ClusterPropagationPolicy
echo "Step 4: Deploying CRD ClusterPropagationPolicy..."
kubectl --context="${KARMADA_CONTEXT}" apply -f "${SCRIPT_DIR}/kueue-crd-propagation-policy.yaml"
echo "✓ CRD propagation policy deployed"
echo ""

# Wait a moment for CRD to propagate
echo "Waiting 5 seconds for CRD to propagate to member clusters..."
sleep 5
echo ""

# Step 5: Deploy WorkloadPriorityClass ClusterPropagationPolicies
echo "Step 5: Deploying WorkloadPriorityClass ClusterPropagationPolicies..."
kubectl --context="${KARMADA_CONTEXT}" apply -f "${SCRIPT_DIR}/workload-priority-propagation-policy.yaml"
kubectl --context="${KARMADA_CONTEXT}" apply -f "${SCRIPT_DIR}/profile-priority-configmap-propagation-policy.yaml"
echo "✓ ClusterPropagationPolicies deployed"
echo ""

# Verification
echo "=========================================="
echo "Verification"
echo "=========================================="
echo ""

echo "WorkloadPriorityClass resources:"
kubectl --context="${KARMADA_CONTEXT}" get workloadpriorityclass | grep -E "NAME|priority-training" || echo "  No resources found"
echo ""

echo "ConfigMap:"
kubectl --context="${KARMADA_CONTEXT}" get configmap profile-priority -n ml-platform-system || echo "  ConfigMap not found"
echo ""

echo "ClusterPropagationPolicies:"
kubectl --context="${KARMADA_CONTEXT}" get clusterpropagationpolicy | grep -E "NAME|priority" || echo "  No policies found"
echo ""

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Verify resources are propagated to member clusters"
echo "  2. Use the backend API to manage profile priorities"
echo ""
echo "To check propagation status on a member cluster:"
echo "  kubectl --context=<member-cluster> get workloadpriorityclass"
echo "  kubectl --context=<member-cluster> get configmap profile-priority -n ml-platform-system"
echo ""

