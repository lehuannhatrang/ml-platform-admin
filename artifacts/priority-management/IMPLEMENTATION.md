# Priority Management - Implementation Guide

## Overview

This document describes the complete implementation of the Priority Management feature for the ML Platform Admin.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend UI                           │
│  (React + Ant Design - Priority Management Page)            │
└──────────────────┬──────────────────────────────────────────┘
                   │ REST API calls
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend API (Go)                         │
│  (/api/v1/priority/* endpoints)                             │
└──────────────────┬──────────────────────────────────────────┘
                   │ Update ConfigMap
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Karmada Control Plane                          │
│  ConfigMap: profile-priority (ml-platform-system)           │
└──────────────────┬──────────────────────────────────────────┘
                   │ Propagation Policy
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   Member Clusters                           │
│  - WorkloadPriorityClass CRD                                │
│  - 3 Priority Classes (Low, Standard, High)                 │
│  - profile-priority ConfigMap                               │
└─────────────────────────────────────────────────────────────┘
```

## Components Created

### 1. Backend API

**File**: `cmd/api/app/routes/priority/handler.go`

**Endpoints**:
- `GET /api/v1/priority` - List all priority assignments
- `GET /api/v1/priority/:profile` - Get priority for specific profile
- `POST /api/v1/priority` - Create new priority assignment
- `PUT /api/v1/priority/:profile` - Update priority assignment
- `DELETE /api/v1/priority/:profile` - Delete priority assignment

**Features**:
- ✅ Auto-creates ConfigMap if it doesn't exist
- ✅ Default priority is "low-priority-training"
- ✅ Validates priority class values
- ✅ Updates ConfigMap in ml-platform-system namespace
- ✅ Changes automatically propagate to all clusters via Karmada

**Registration**: Added to `cmd/api/app/api.go` imports

### 2. Frontend Service

**File**: `ui/apps/dashboard/src/services/priority.ts`

**Functions**:
```typescript
GetPriorities()              // Fetch all assignments
GetPriority(profile)         // Fetch single assignment
SetPriority(data)            // Create assignment
UpdatePriority(profile, pc)  // Update assignment
DeletePriority(profile)      // Delete assignment
```

### 3. Frontend Page

**File**: `ui/apps/dashboard/src/pages/priority/index.tsx`

**Features**:
- ✅ Material design table with sortable columns
- ✅ Create priority assignment modal
- ✅ Edit priority assignment modal
- ✅ Delete confirmation with custom message
- ✅ Visual priority indicators (colored tags)
- ✅ Real-time updates via React Query
- ✅ Form validation
- ✅ Empty state with call-to-action
- ✅ Responsive layout

**Route**: `/profile-manage/Priority`

**Navigation**: Added to sidebar under "Profiles Management"

### 4. Infrastructure

**Directory**: `artifacts/priority-management/`

**Files**:
- `kueue-workloadpriorityclass-crd.yaml` - Kueue CRD
- `kueue-crd-propagation-policy.yaml` - CRD propagation
- `workload-priority-classes.yaml` - 3 priority classes
- `profile-priority-configmap.yaml` - ConfigMap template
- `workload-priority-propagation-policy.yaml` - Priority classes propagation
- `profile-priority-configmap-propagation-policy.yaml` - ConfigMap propagation
- `all-in-one.yaml` - Combined manifest
- `deploy.sh` - Automated deployment script
- `undeploy.sh` - Cleanup script
- `README.md` - Full documentation
- `QUICK_START.md` - Quick reference
- `INSTALL.md` - Installation guide

## Priority Levels

| Priority Class | Value | Color | Description |
|---------------|-------|-------|-------------|
| low-priority-training | 25 | Gray | Default priority, standard workloads |
| standard-priority-training | 50 | Blue | Medium priority, normal workloads |
| high-priority-training | 100 | Red | Highest priority, critical workloads |

## Data Flow

### Creating/Updating Priority Assignment

1. Admin opens Priority Management page
2. Fills form with profile name and priority class
3. Frontend sends POST/PUT request to backend
4. Backend validates request
5. Backend updates ConfigMap in Karmada control plane
6. Karmada propagates ConfigMap to all member clusters
7. Member clusters receive updated ConfigMap
8. Workloads can now reference priorities via the ConfigMap

### Default Behavior

- If a profile doesn't have an explicit priority assignment, it defaults to **"low-priority-training"**
- This ensures all users have a priority level without requiring explicit configuration

## Deployment Steps

### Step 1: Deploy Infrastructure

```bash
cd /home/ubuntu/projects/ml-platform-admin/artifacts/priority-management
./deploy.sh
```

This will:
1. Install Kueue WorkloadPriorityClass CRD
2. Deploy 3 priority classes
3. Create profile-priority ConfigMap
4. Set up propagation policies
5. Verify deployment

### Step 2: Build Backend

```bash
cd /home/ubuntu/projects/ml-platform-admin
make build
```

### Step 3: Build Frontend

```bash
cd /home/ubuntu/projects/ml-platform-admin
make bundle-ui-dashboard
```

### Step 4: Deploy/Restart Services

Restart the API and web services to load the new code:
```bash
# If running locally
make run

# If using Docker
make images
# Then deploy updated images
```

## Usage

### Via Web UI

1. Navigate to **Profiles Management** → **Priority** in the sidebar
2. Click **"Assign Priority"** button
3. Enter profile name (e.g., "user-example")
4. Select priority level (Low/Standard/High)
5. Click **"OK"** to save

### Via API

**Create Assignment**:
```bash
curl -X POST http://localhost:8000/api/v1/priority \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "user-example",
    "priorityClass": "high-priority-training"
  }'
```

**List Assignments**:
```bash
curl http://localhost:8000/api/v1/priority
```

**Update Assignment**:
```bash
curl -X PUT http://localhost:8000/api/v1/priority/user-example \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "user-example",
    "priorityClass": "standard-priority-training"
  }'
```

**Delete Assignment**:
```bash
curl -X DELETE http://localhost:8000/api/v1/priority/user-example
```

## Verification

### Check ConfigMap

```bash
kubectl --context=karmada-apiserver get configmap profile-priority \
  -n ml-platform-system -o yaml
```

### Check Propagation to Member Cluster

```bash
kubectl --context=<member-cluster> get configmap profile-priority \
  -n ml-platform-system -o yaml
```

### Check Priority Classes

```bash
kubectl --context=<member-cluster> get workloadpriorityclass
```

Expected output:
```
NAME                         VALUE
high-priority-training       100
low-priority-training        25
standard-priority-training   50
```

## Configuration

### Environment Variables

No additional environment variables needed. The feature uses:
- Karmada client (configured via kubeconfig)
- ml-platform-system namespace (hardcoded)
- profile-priority ConfigMap name (hardcoded)

### Customization

To add more priority levels:

1. Edit `artifacts/priority-management/workload-priority-classes.yaml`
2. Add new WorkloadPriorityClass resource
3. Update propagation policy to include new class
4. Update frontend `PRIORITY_OPTIONS` in `ui/apps/dashboard/src/pages/priority/index.tsx`
5. Update backend validation in `cmd/api/app/routes/priority/handler.go`

## Troubleshooting

### ConfigMap not found

The backend auto-creates the ConfigMap on first access. If you see errors:
```bash
# Manually create namespace if needed
kubectl --context=karmada-apiserver create namespace ml-platform-system

# Manually create ConfigMap
kubectl --context=karmada-apiserver apply -f \
  artifacts/priority-management/profile-priority-configmap.yaml
```

### Changes not propagating

Check propagation policy status:
```bash
kubectl --context=karmada-apiserver get clusterpropagationpolicy \
  profile-priority-configmap-propagation -o yaml
```

### Frontend not showing page

1. Check browser console for errors
2. Verify route is registered in `ui/apps/dashboard/src/routes/route.tsx`
3. Rebuild frontend: `make bundle-ui-dashboard`
4. Clear browser cache

### API returning 404

1. Verify backend is running
2. Check route registration in `cmd/api/app/api.go`
3. Rebuild backend: `make build`
4. Check API logs for errors

## Security Considerations

### Access Control

- API endpoints should be protected by authentication middleware
- Users need appropriate Keycloak roles to access the feature
- ConfigMap updates require Karmada API access

### Validation

- Profile names are validated to be valid Kubernetes names
- Priority classes are validated against allowed values
- SQL injection and XSS protection via framework

## Future Enhancements

### Potential Features

1. **Bulk Import/Export**
   - CSV import for multiple assignments
   - Export current assignments to CSV

2. **Priority History**
   - Track priority changes over time
   - Audit log of who changed what

3. **Auto-Assignment**
   - Automatically assign priority based on user roles
   - Integration with user creation workflow

4. **Usage Analytics**
   - Show which priorities are most used
   - Display resource consumption by priority

5. **Quota Integration**
   - Link priorities to resource quotas
   - Enforce priority-based limits

## Testing

### Manual Testing

1. **Create Assignment**:
   - Navigate to Priority page
   - Click "Assign Priority"
   - Enter profile "test-user"
   - Select "High"
   - Verify creation in table

2. **Edit Assignment**:
   - Click "Edit" on an assignment
   - Change priority to "Standard"
   - Verify update in table

3. **Delete Assignment**:
   - Click "Delete" on an assignment
   - Confirm deletion
   - Verify removal from table

4. **API Testing**:
   - Use curl commands from Usage section
   - Verify responses and data

### Integration Testing

```bash
# Deploy infrastructure
./artifacts/priority-management/deploy.sh

# Create test assignment via API
curl -X POST http://localhost:8000/api/v1/priority \
  -H "Content-Type: application/json" \
  -d '{"profile": "test-user", "priorityClass": "high-priority-training"}'

# Verify in ConfigMap
kubectl get configmap profile-priority -n ml-platform-system -o jsonpath='{.data.test-user}'

# Clean up
curl -X DELETE http://localhost:8000/api/v1/priority/test-user
```

## Support & Maintenance

### Monitoring

- Monitor ConfigMap updates via Kubernetes events
- Track API endpoint usage via logs
- Set up alerts for failed propagations

### Backup

The ConfigMap should be included in regular Kubernetes backups:
```bash
kubectl get configmap profile-priority -n ml-platform-system -o yaml > \
  backup-priority-$(date +%Y%m%d).yaml
```

### Updates

To update priority class values:
1. Edit WorkloadPriorityClass resources
2. Apply changes: `kubectl apply -f workload-priority-classes.yaml`
3. Changes propagate automatically

## References

- [Kueue Documentation](https://kueue.sigs.k8s.io/docs/)
- [WorkloadPriorityClass API](https://kueue.sigs.k8s.io/docs/concepts/workload_priority_class/)
- [Karmada Propagation Policies](https://karmada.io/docs/userguide/scheduling/resource-propagating/)
- [Kubeflow Profiles](https://www.kubeflow.org/docs/components/multi-tenancy/getting-started/)

