# Priority Management - Quick Start Guide

## Overview

This guide helps you quickly deploy the Priority Management feature for your ML Platform.

## What Gets Deployed

1. **Kueue WorkloadPriorityClass CRD**
   - CustomResourceDefinition from the [official Kueue repository](https://raw.githubusercontent.com/kubernetes-sigs/kueue/refs/heads/main/config/components/crd/bases/kueue.x-k8s.io_workloadpriorityclasses.yaml)
   - Required for WorkloadPriorityClass resources

2. **3 WorkloadPriorityClass resources** (Kueue CRs)
   - `low-priority-training` (priority: 25)
   - `standard-priority-training` (priority: 50)
   - `high-priority-training` (priority: 100)

3. **1 ConfigMap** (`profile-priority` in `ml-platform-system` namespace)
   - Stores mapping: user profile → priority class

4. **3 ClusterPropagationPolicies**
   - Propagates CRD to all clusters
   - Propagates WorkloadPriorityClasses to all clusters
   - Propagates ConfigMap to all clusters

## Prerequisites

- ✓ Karmada control plane is running
- ✓ `ml-platform-system` namespace exists (script will create if missing)
- ✓ `kubectl` configured with Karmada context

**Note**: You do NOT need to pre-install Kueue. The deployment script will install the required Kueue CRD and propagate it to all member clusters.

## Quick Deploy

### Option 1: Using the deployment script (Recommended)

```bash
cd artifacts/priority-management

# Default context is 'karmada-apiserver'
./deploy.sh

# Or specify custom Karmada context
KARMADA_CONTEXT=my-karmada-context ./deploy.sh
```

### Option 2: Using kubectl directly

```bash
cd artifacts/priority-management

# Apply all resources at once (includes CRD)
kubectl --context=karmada-apiserver apply -f all-in-one.yaml

# Or apply individually for more control
kubectl --context=karmada-apiserver apply -f kueue-workloadpriorityclass-crd.yaml
kubectl --context=karmada-apiserver apply -f kueue-crd-propagation-policy.yaml
sleep 5  # Wait for CRD to propagate
kubectl --context=karmada-apiserver apply -f workload-priority-classes.yaml
kubectl --context=karmada-apiserver apply -f profile-priority-configmap.yaml
kubectl --context=karmada-apiserver apply -f workload-priority-propagation-policy.yaml
kubectl --context=karmada-apiserver apply -f profile-priority-configmap-propagation-policy.yaml
```

## Verification

### On Karmada Control Plane

```bash
# Check WorkloadPriorityClasses
kubectl --context=karmada-apiserver get workloadpriorityclass

# Check ConfigMap
kubectl --context=karmada-apiserver get configmap profile-priority -n ml-platform-system -o yaml

# Check propagation policies
kubectl --context=karmada-apiserver get clusterpropagationpolicy | grep priority
```

### On Member Clusters

Replace `<member-cluster>` with your actual member cluster context:

```bash
# Check if WorkloadPriorityClasses are propagated
kubectl --context=<member-cluster> get workloadpriorityclass

# Check if ConfigMap is propagated
kubectl --context=<member-cluster> get configmap profile-priority -n ml-platform-system
```

## Using the Feature

### Via Backend API

The backend API will provide endpoints to manage priorities:

```bash
# Example: Assign high priority to user-example profile
POST /api/v1/priority-management
{
  "profile": "user-example",
  "priority_class": "high-priority-training"
}

# Example: Update priority
PUT /api/v1/priority-management/user-example
{
  "priority_class": "standard-priority-training"
}

# Example: Remove priority assignment
DELETE /api/v1/priority-management/user-example
```

### Manual ConfigMap Update (for testing)

```bash
kubectl --context=karmada-apiserver edit configmap profile-priority -n ml-platform-system
```

Add entries like:
```yaml
data:
  "user-example": "high-priority-training"
  "user1": "standard-priority-training"
  "user2": "low-priority-training"
```

Changes will automatically propagate to all member clusters.

## Uninstall

```bash
cd artifacts/priority-management

# Using script
./undeploy.sh

# Or using kubectl
kubectl --context=karmada-apiserver delete -f all-in-one.yaml
```

## Troubleshooting

### Resources not propagating to member clusters

1. Check propagation policy status:
```bash
kubectl --context=karmada-apiserver get clusterpropagationpolicy workload-priority-classes-propagation -o yaml
```

2. Check resource bindings:
```bash
kubectl --context=karmada-apiserver get resourcebinding -A | grep priority
```

3. Verify member clusters are connected:
```bash
kubectl --context=karmada-apiserver get clusters
```

### ConfigMap updates not reflecting on member clusters

- ConfigMap updates should propagate automatically within seconds
- Check Karmada controller logs if updates don't appear
- Verify propagation policy exists and is not conflicting with other policies

### WorkloadPriorityClass not recognized

- Ensure Kueue CRD is propagated to member clusters:
```bash
kubectl --context=<member-cluster> get crd workloadpriorityclasses.kueue.x-k8s.io
```
- If not present, check the CRD propagation policy:
```bash
kubectl --context=karmada-apiserver get clusterpropagationpolicy kueue-workloadpriorityclass-crd-propagation -o yaml
```

## File Structure

```
artifacts/priority-management/
├── README.md                                            # Full documentation
├── QUICK_START.md                                      # This file
├── all-in-one.yaml                                     # Combined manifest (includes CRD)
├── kueue-workloadpriorityclass-crd.yaml                # Kueue CRD definition
├── kueue-crd-propagation-policy.yaml                   # Propagation for CRD
├── workload-priority-classes.yaml                      # Priority class definitions
├── profile-priority-configmap.yaml                     # ConfigMap for mappings
├── workload-priority-propagation-policy.yaml           # Propagation for priority classes
├── profile-priority-configmap-propagation-policy.yaml  # Propagation for ConfigMap
├── deploy.sh                                           # Deployment script
└── undeploy.sh                                         # Undeployment script
```

## Next Steps

1. ✅ Deploy the artifacts (you're here!)
2. 📝 Implement backend CRUD API for priority management
3. 🎨 Create frontend admin UI for managing priorities
4. 🧪 Test priority enforcement in your training workloads
5. 📊 Monitor and adjust priority values based on usage patterns

## Support

For issues or questions:
- Check the full README.md for detailed documentation
- Review Karmada documentation: https://karmada.io/docs/
- Review Kueue documentation: https://kueue.sigs.k8s.io/docs/

