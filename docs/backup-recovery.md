# Backup & Recovery Feature

This document describes the comprehensive Backup & Recovery feature implementation based on the [stateful-migration-operator](https://github.com/lehuannhatrang/stateful-migration-operator).

## Overview

The Backup & Recovery feature enables users to:
- Configure image registries for backup storage
- Create automated backup schedules for stateful workloads
- Perform recovery operations across clusters
- Manage migration controller deployment

## Components

### Backend API Routes

The feature implements the following API endpoints:

#### Registry Management (`/api/v1/backup/registry`)
- `GET /` - List all registries
- `POST /` - Create new registry
- `GET /:id` - Get registry details
- `PUT /:id` - Update registry
- `DELETE /:id` - Delete registry

#### Backup Management (`/api/v1/backup`)
- `GET /` - List all backup configurations
- `POST /` - Create backup configuration
- `GET /:id` - Get backup details
- `PUT /:id` - Update backup configuration
- `DELETE /:id` - Delete backup configuration
- `POST /:id/execute` - Execute backup immediately
- `GET /clusters/:cluster/resources` - Get available resources in cluster

#### Recovery Management (`/api/v1/backup/recovery`)
- `GET /` - List recovery history
- `POST /` - Create recovery operation
- `GET /:id` - Get recovery details
- `POST /:id/execute` - Start recovery execution
- `POST /:id/cancel` - Cancel running recovery
- `DELETE /:id` - Delete recovery record
- `GET /backup/:backupId/history` - Get backup execution history

#### Settings (`/api/v1/backup/settings`)
- `GET /clusters` - List all clusters with controller status
- `GET /clusters/:name` - Get cluster details
- `POST /clusters/install-controller` - Install migration controller
- `POST /clusters/uninstall-controller` - Uninstall migration controller
- `GET /clusters/:name/controller-status` - Check controller status
- `GET /clusters/:name/controller-logs` - Get controller logs

### Frontend Pages

#### Registry Page (`/backup-recovery/registry`)
- Add/edit container image registries
- Configure authentication credentials
- Manage registry connections

#### Backup Page (`/backup-recovery/backup`)
- Create backup configurations
- Select clusters and resources
- Configure backup schedules (quick selection or cron)
- Execute immediate backups
- View backup status

#### Recovery Page (`/backup-recovery/recovery`)
- View recovery operation history
- Create new recovery operations
- Monitor recovery progress
- Cancel running operations

#### Settings Page (`/backup-recovery/settings`)
- View cluster status
- Install/uninstall migration controllers
- Check controller health
- View controller logs

## StatefulMigration CRD Integration

The feature integrates with the StatefulMigration Custom Resource Definition:

### Backup Operations
When creating a backup, a StatefulMigration CR is created with:
```yaml
apiVersion: migration.dcnlab.com/v1alpha1
kind: StatefulMigration
metadata:
  name: backup-{backup-id}
  namespace: karmada-system
  labels:
    app: backup-migration
    backup-id: {backup-id}
    type: backup
spec:
  targetCluster: {cluster-name}
  resourceType: {pod|statefulset}
  resourceName: {resource-name}
  namespace: {namespace}
  registryID: {registry-id}
  repository: {repository-path}
  imageRepository: {full-registry-url}
  backupType: checkpoint
  schedule:
    type: {selection|cron}
    value: {schedule-value}
    cron: {cron-expression}
    enabled: true
  phase: pending
```

### Recovery Operations
Recovery operations create a StatefulMigration CR with recovery configuration:
```yaml
apiVersion: migration.dcnlab.com/v1alpha1
kind: StatefulMigration
metadata:
  name: recovery-{recovery-id}
  namespace: karmada-system
  labels:
    app: recovery-migration
    recovery-id: {recovery-id}
    backup-id: {backup-id}
    type: recovery
spec:
  targetCluster: {target-cluster}
  resourceType: {resource-type}
  resourceName: {resource-name}
  namespace: {namespace}
  recoveryConfig:
    backupID: {backup-id}
    sourceCluster: {source-cluster}
    recoveryType: {restore|migrate}
    targetName: {target-resource-name}
    targetNamespace: {target-namespace}
  phase: pending
```

## Migration Controller Deployment

The feature automatically manages migration controller deployment:

### Management Cluster
- **Component**: MigrationBackup Controller
- **Deployment**: Standard Kubernetes Deployment
- **Responsibilities**: 
  - Manages StatefulMigration CRs
  - Orchestrates backup/recovery operations
  - Provides API for backup management

### Member Clusters
- **Component**: CheckpointBackup Controller
- **Deployment**: DaemonSet on all nodes
- **Responsibilities**:
  - Performs container checkpointing
  - Handles backup storage to registries
  - Executes recovery operations

### Installation Process
1. **CRD Application**: Apply StatefulMigration CRD
2. **RBAC Setup**: Create necessary roles and bindings
3. **Controller Deployment**: Deploy appropriate controller type
4. **Propagation**: Use Karmada PropagationPolicy for member clusters

## Security Considerations

### Registry Credentials
- Stored as Kubernetes Secrets in `karmada-system` namespace
- Propagated to member clusters using PropagationPolicy
- Never exposed in API responses

### RBAC Permissions
- Controllers require specific permissions for checkpoint operations
- Node access for kubelet checkpoint API
- Secret management for registry credentials

### Network Security
- Registry connections use HTTPS
- Backup data encrypted in transit
- Access controlled through Karmada RBAC

## Usage Examples

### 1. Create Registry
```bash
curl -X POST /api/v1/backup/registry \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Docker Hub",
    "url": "https://index.docker.io/v1/",
    "username": "myuser",
    "password": "mypass",
    "description": "Main Docker Hub registry"
  }'
```

### 2. Create Backup Configuration
```bash
curl -X POST /api/v1/backup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mysql-daily-backup",
    "cluster": "prod-cluster",
    "resourceType": "statefulset",
    "resourceName": "mysql",
    "namespace": "database",
    "registryId": "registry-123",
    "repository": "backups/mysql",
    "schedule": {
      "type": "cron",
      "value": "0 2 * * *",
      "enabled": true
    }
  }'
```

### 3. Create Recovery Operation
```bash
curl -X POST /api/v1/backup/recovery \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mysql-restore-dev",
    "backupId": "backup-123",
    "targetCluster": "dev-cluster",
    "recoveryType": "migrate",
    "targetNamespace": "development"
  }'
```

### 4. Install Controller
```bash
curl -X POST /api/v1/backup/settings/clusters/install-controller \
  -H "Content-Type: application/json" \
  -d '{
    "clusterName": "prod-cluster",
    "version": "v2.0"
  }'
```

## Monitoring and Troubleshooting

### Status Monitoring
- Backup configurations show last execution time and status
- Recovery operations display progress percentage
- Controller status indicates health and version

### Log Access
- Controller logs available through settings page
- Backup/recovery execution logs in StatefulMigration status
- Error messages displayed in UI for failed operations

### Common Issues
1. **Controller Installation Failures**: Check RBAC permissions and network connectivity
2. **Backup Failures**: Verify registry credentials and disk space
3. **Recovery Failures**: Ensure target cluster has sufficient resources
4. **Network Issues**: Check connectivity between clusters and registries

## Performance Considerations

### Resource Requirements
- **CheckpointBackup Controller**: 100m CPU, 128Mi memory per node
- **MigrationBackup Controller**: 10m CPU, 64Mi memory
- **Backup Storage**: 50MB-500MB per container checkpoint

### Scaling Recommendations
- Use dedicated storage for large backups
- Consider backup retention policies
- Monitor registry bandwidth usage
- Schedule backups during low-traffic periods

This implementation provides a comprehensive solution for stateful workload backup and recovery in multi-cluster Kubernetes environments using Karmada.



