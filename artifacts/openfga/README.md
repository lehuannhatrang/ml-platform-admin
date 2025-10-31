# OpenFGA Integration for Karmada Dashboard

This directory contains artifacts for integrating [OpenFGA](https://openfga.dev/) (Fine-Grained Authorization) with the Karmada Dashboard.

## Components

- `openfga-svc.yaml`: Service definition for accessing the OpenFGA API

## Prerequisites

OpenFGA should be installed in the `karmada-system` namespace using Helm:

```bash
helm install --namespace karmada-system openfga openfga/openfga \
  --set datastore.engine=postgres \
  --set datastore.uri="postgres://postgres:password@openfga-postgresql.ml-platform-system.svc.cluster.local:5432/postgres?sslmode=disable" \
  --set postgresql.enabled=true \
  --set postgresql.auth.postgresPassword=password \
  --set postgresql.auth.database=postgres
```

## Integration Steps

1. **Apply the OpenFGA artifacts**:
   ```bash
   kubectl apply -k artifacts/openfga
   ```

2. **Access OpenFGA API**:
   When using NodePort mode, the OpenFGA API and Playground will be available at:
   - HTTP API: `http://<any-node-ip>:30080`
   - gRPC API: `http://<any-node-ip>:30081`
   - Playground UI: `http://<any-node-ip>:30082`

3. **Create Store and Authorization Model**:
   - Use the OpenFGA HTTP API or Playground UI to create a store and authorization model
   - Configure your authorization model based on your access control requirements

4. **Update dashboard configuration**:
   - Edit `artifacts/overlays/nodeport-mode/dashboard-config.yaml` with your store and authorization model IDs
   - Apply the updated configuration:
     ```bash
     kubectl apply -k artifacts/overlays/nodeport-mode
     ```
