#!/bin/bash
set -e

# Priority Management Undeployment Script
# This script removes the Priority Management artifacts from the Karmada control plane

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KARMADA_CONTEXT="${KARMADA_CONTEXT:-karmada-apiserver}"

echo "=========================================="
echo "Priority Management Undeployment"
echo "=========================================="
echo ""
echo "Karmada Context: ${KARMADA_CONTEXT}"
echo ""

# Check if Karmada context is available
if ! kubectl config get-contexts "${KARMADA_CONTEXT}" &>/dev/null; then
    echo "Error: Karmada context '${KARMADA_CONTEXT}' not found"
    echo "Please set KARMADA_CONTEXT environment variable or ensure kubeconfig is correct"
    exit 1
fi

# Confirm deletion
read -p "Are you sure you want to remove all Priority Management resources? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Undeployment cancelled"
    exit 0
fi

# Step 1: Delete WorkloadPriorityClass ClusterPropagationPolicies
echo "Step 1: Deleting WorkloadPriorityClass ClusterPropagationPolicies..."
kubectl --context="${KARMADA_CONTEXT}" delete -f "${SCRIPT_DIR}/workload-priority-propagation-policy.yaml" --ignore-not-found=true
kubectl --context="${KARMADA_CONTEXT}" delete -f "${SCRIPT_DIR}/profile-priority-configmap-propagation-policy.yaml" --ignore-not-found=true
echo "✓ ClusterPropagationPolicies deleted"
echo ""

# Step 2: Delete profile-priority ConfigMap
echo "Step 2: Deleting profile-priority ConfigMap..."
kubectl --context="${KARMADA_CONTEXT}" delete -f "${SCRIPT_DIR}/profile-priority-configmap.yaml" --ignore-not-found=true
echo "✓ ConfigMap deleted"
echo ""

# Step 3: Delete WorkloadPriorityClass resources
echo "Step 3: Deleting WorkloadPriorityClass resources..."
kubectl --context="${KARMADA_CONTEXT}" delete -f "${SCRIPT_DIR}/workload-priority-classes.yaml" --ignore-not-found=true
echo "✓ WorkloadPriorityClass resources deleted"
echo ""

# Step 4: Delete CRD ClusterPropagationPolicy
echo "Step 4: Deleting CRD ClusterPropagationPolicy..."
kubectl --context="${KARMADA_CONTEXT}" delete -f "${SCRIPT_DIR}/kueue-crd-propagation-policy.yaml" --ignore-not-found=true
echo "✓ CRD propagation policy deleted"
echo ""

# Step 5: Delete Kueue WorkloadPriorityClass CRD
echo "Step 5: Deleting Kueue WorkloadPriorityClass CRD..."
read -p "Do you want to delete the Kueue WorkloadPriorityClass CRD? This will affect ALL WorkloadPriorityClass resources. (yes/no): " delete_crd
if [ "$delete_crd" = "yes" ]; then
    kubectl --context="${KARMADA_CONTEXT}" delete -f "${SCRIPT_DIR}/kueue-workloadpriorityclass-crd.yaml" --ignore-not-found=true
    echo "✓ CRD deleted"
else
    echo "  Skipping CRD deletion"
fi
echo ""

echo "=========================================="
echo "Undeployment Complete!"
echo "=========================================="
echo ""
echo "Note: Resources may still exist on member clusters until they are cleaned up by Karmada"
echo "You can verify removal on member clusters using:"
echo "  kubectl --context=<member-cluster> get workloadpriorityclass"
echo "  kubectl --context=<member-cluster> get configmap profile-priority -n ml-platform-system"
echo ""

