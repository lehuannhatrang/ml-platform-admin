# Priority Management - Installation Guide

## TL;DR - Quick Install

Run the deployment script (recommended):

```bash
cd /home/ubuntu/projects/ml-platform-admin/artifacts/priority-management
./deploy.sh
```

That's it! The script will:
1. ✅ Install the Kueue WorkloadPriorityClass CRD
2. ✅ Deploy the 3 priority classes (low, standard, high)
3. ✅ Create the profile-priority ConfigMap
4. ✅ Set up propagation policies to distribute everything to all clusters
5. ✅ Verify the deployment

## What Was Installed

### On Karmada Control Plane:
- **1 CRD**: `workloadpriorityclasses.kueue.x-k8s.io`
- **3 WorkloadPriorityClasses**: low (25), standard (50), high (100)
- **1 ConfigMap**: `profile-priority` in `ml-platform-system` namespace
- **3 ClusterPropagationPolicies**: For CRD, WorkloadPriorityClasses, and ConfigMap

### Automatically Propagated to All Member Clusters:
- The CRD
- All 3 WorkloadPriorityClasses
- The profile-priority ConfigMap

## Verify Installation

### On Karmada Control Plane

```bash
# Check CRD
kubectl --context=karmada-apiserver get crd workloadpriorityclasses.kueue.x-k8s.io

# Check WorkloadPriorityClasses
kubectl --context=karmada-apiserver get workloadpriorityclass

# Check ConfigMap
kubectl --context=karmada-apiserver get configmap profile-priority -n ml-platform-system

# Check propagation policies
kubectl --context=karmada-apiserver get clusterpropagationpolicy | grep priority
```

Expected output for WorkloadPriorityClasses:
```
NAME                        VALUE
high-priority-training      100
low-priority-training       25
standard-priority-training  50
```

### On Member Clusters

Replace `<member-cluster>` with your actual member cluster context:

```bash
# Check if CRD is propagated
kubectl --context=<member-cluster> get crd workloadpriorityclasses.kueue.x-k8s.io

# Check if WorkloadPriorityClasses are propagated
kubectl --context=<member-cluster> get workloadpriorityclass

# Check if ConfigMap is propagated
kubectl --context=<member-cluster> get configmap profile-priority -n ml-platform-system
```

## Manual Installation (Alternative)

If you prefer to install manually:

```bash
cd /home/ubuntu/projects/ml-platform-admin/artifacts/priority-management

# Install everything at once
kubectl --context=karmada-apiserver apply -f all-in-one.yaml
```

## Troubleshooting

### Issue: "no matches for kind WorkloadPriorityClass"

**Cause**: CRD is not installed or not yet propagated to the cluster.

**Solution**:
```bash
# On Karmada control plane
kubectl --context=karmada-apiserver get crd workloadpriorityclasses.kueue.x-k8s.io

# If not present, install it
kubectl --context=karmada-apiserver apply -f kueue-workloadpriorityclass-crd.yaml
kubectl --context=karmada-apiserver apply -f kueue-crd-propagation-policy.yaml

# Wait for propagation
sleep 10
```

### Issue: Resources not appearing on member clusters

**Check propagation status**:
```bash
# Check resource bindings
kubectl --context=karmada-apiserver get resourcebinding -A | grep priority

# Check cluster propagation policies
kubectl --context=karmada-apiserver get clusterpropagationpolicy -o wide

# Check if member clusters are ready
kubectl --context=karmada-apiserver get clusters
```

### Issue: ConfigMap updates not propagating

**Cause**: ConfigMap updates should propagate automatically.

**Solution**:
```bash
# Force reconciliation by updating a label
kubectl --context=karmada-apiserver label configmap profile-priority \
  -n ml-platform-system reconcile-trigger=$(date +%s) --overwrite
```

## Uninstall

To remove all Priority Management resources:

```bash
cd /home/ubuntu/projects/ml-platform-admin/artifacts/priority-management
./undeploy.sh
```

The script will:
1. Ask for confirmation
2. Delete all propagation policies
3. Delete the ConfigMap
4. Delete the WorkloadPriorityClasses
5. Ask if you want to delete the CRD (affects all WorkloadPriorityClass resources)

## Next Steps

Now that the infrastructure is deployed:

1. **Backend API**: Implement CRUD endpoints to manage the ConfigMap
   - GET `/api/v1/priority-management` - List all priority assignments
   - POST `/api/v1/priority-management` - Create priority assignment
   - PUT `/api/v1/priority-management/:profile` - Update priority assignment
   - DELETE `/api/v1/priority-management/:profile` - Remove priority assignment

2. **Frontend UI**: Create admin interface to:
   - View all user profiles and their priorities
   - Assign/change priorities via dropdown (low/standard/high)
   - Search and filter profiles
   - Bulk priority updates

3. **Test**: Create test workloads with different priorities to verify scheduling behavior

## References

- **Kueue Documentation**: https://kueue.sigs.k8s.io/docs/
- **WorkloadPriorityClass CRD Source**: https://raw.githubusercontent.com/kubernetes-sigs/kueue/refs/heads/main/config/components/crd/bases/kueue.x-k8s.io_workloadpriorityclasses.yaml
- **Karmada Propagation Policies**: https://karmada.io/docs/userguide/scheduling/resource-propagating/

