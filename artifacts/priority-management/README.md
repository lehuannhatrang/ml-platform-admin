# Priority Management Artifacts

This directory contains Kubernetes artifacts for the Priority Management feature.

## Overview

The Priority Management feature allows administrators to assign priorities to user profiles (Kubeflow namespaces). This is achieved through:

1. **WorkloadPriorityClass CRs**: Kueue resources that define priority levels
2. **ConfigMap**: Maps user profiles to priority classes
3. **ClusterPropagationPolicies**: Karmada policies to propagate resources to all member clusters

## Components

### 1. WorkloadPriorityClass Resources

File: `workload-priority-classes.yaml`

Three priority classes are defined:
- **low-priority-training**: Priority value 25
- **standard-priority-training**: Priority value 50 (medium)
- **high-priority-training**: Priority value 100

These are Kueue WorkloadPriorityClass CRs that control the scheduling priority of workloads.

Example structure (note: no `spec` field, values are at top level):
```yaml
apiVersion: kueue.x-k8s.io/v1beta1
kind: WorkloadPriorityClass
metadata:
  name: high-priority-training
value: 100
description: "High priority workloads for training jobs"
```

### 2. Profile Priority ConfigMap

File: `profile-priority-configmap.yaml`

This ConfigMap stores the mapping between user profiles (namespaces) and their assigned priority classes:
```yaml
data:
  "user-example": "high-priority-training"
  "user1": "standard-priority-training"
```

The ConfigMap is managed by the backend API and should be applied to the Karmada control plane.

### 3. Kueue CRD

File: `kueue-workloadpriorityclass-crd.yaml`

The Kueue WorkloadPriorityClass CustomResourceDefinition must be installed on the Karmada control plane and propagated to all member clusters. This CRD is sourced from the official [Kueue repository](https://raw.githubusercontent.com/kubernetes-sigs/kueue/refs/heads/main/config/components/crd/bases/kueue.x-k8s.io_workloadpriorityclasses.yaml).

### 4. Propagation Policies

Three ClusterPropagationPolicies ensure resources are propagated to all member clusters:

#### a. CRD Propagation
File: `kueue-crd-propagation-policy.yaml`

Propagates the Kueue WorkloadPriorityClass CRD to all member clusters.

#### b. WorkloadPriorityClass Propagation
File: `workload-priority-propagation-policy.yaml`

Propagates all three WorkloadPriorityClass resources to all clusters.

#### c. ConfigMap Propagation
File: `profile-priority-configmap-propagation-policy.yaml`

Propagates the profile-priority ConfigMap to all clusters.

## Deployment

### Prerequisites
- Karmada control plane is running
- Kueue is installed on all member clusters
- `ml-platform-system` namespace exists

### Installation

Apply the artifacts to the Karmada control plane in this order:

1. Install the Kueue WorkloadPriorityClass CRD:
```bash
kubectl apply -f kueue-workloadpriorityclass-crd.yaml
```

2. Create the CRD propagation policy (to propagate CRD to all clusters):
```bash
kubectl apply -f kueue-crd-propagation-policy.yaml
```

3. Wait a moment for CRD to propagate, then create the WorkloadPriorityClass resources:
```bash
kubectl apply -f workload-priority-classes.yaml
```

4. Create the profile-priority ConfigMap:
```bash
kubectl apply -f profile-priority-configmap.yaml
```

5. Create the propagation policies:
```bash
kubectl apply -f workload-priority-propagation-policy.yaml
kubectl apply -f profile-priority-configmap-propagation-policy.yaml
```

**Alternative**: Use the all-in-one manifest (includes CRD):
```bash
kubectl apply -f all-in-one.yaml
```

### Verification

Check that resources are created:
```bash
# Check WorkloadPriorityClasses
kubectl get workloadpriorityclass

# Check ConfigMap
kubectl get configmap profile-priority -n ml-platform-system

# Check propagation policies
kubectl get clusterpropagationpolicy | grep priority
```

Verify propagation to member clusters:
```bash
# Check on a specific member cluster
kubectl --context=<member-cluster> get workloadpriorityclass
kubectl --context=<member-cluster> get configmap profile-priority -n ml-platform-system
```

## API Integration

The backend API provides CRUD operations to manage the profile-priority ConfigMap:

- **GET**: Retrieve current priority assignments
- **POST**: Create a new priority assignment for a user profile
- **PUT**: Update an existing priority assignment
- **DELETE**: Remove a priority assignment

The API updates the ConfigMap on the Karmada control plane, and Karmada automatically propagates changes to all member clusters.

## Notes

- The ClusterPropagationPolicy with empty `clusterNames: []` means resources will be propagated to **all** member clusters.
- If you need to target specific clusters, update the `clusterNames` array in the propagation policy.
- The ConfigMap data will be populated by the backend API as users are assigned priorities.

