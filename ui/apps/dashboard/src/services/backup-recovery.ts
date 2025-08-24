/*
Copyright 2024 The Karmada Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { IResponse, karmadaClient } from './base';

// Types
export interface RegistryCredentials {
  id: string;
  name: string;
  registry: string;
  username: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  secretName: string;
}

export interface CreateRegistryRequest {
  name: string;
  registry: string;
  username: string;
  password: string;
  description?: string;
}

export interface UpdateRegistryRequest {
  name?: string;
  registry?: string;
  username?: string;
  password?: string;
  description?: string;
}

export interface RegistryInfo {
  id: string;
  name: string;
  registry: string;
}

export interface ScheduleConfig {
  type: 'selection' | 'cron';
  value: string;
  enabled: boolean;
}

export interface BackupConfiguration {
  id: string;
  name: string;
  cluster: string;
  resourceType: 'pod' | 'statefulset';
  resourceName: string;
  namespace: string;
  registry: RegistryInfo;
  repository: string;
  schedule: ScheduleConfig;
  status: string;
  lastBackup?: string;
  nextBackup?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBackupRequest {
  name: string;
  cluster: string;
  resourceType: 'pod' | 'statefulset';
  resourceName: string;
  namespace: string;
  registryId: string;
  repository: string;
  schedule: ScheduleConfig;
}

export interface UpdateBackupRequest {
  name?: string;
  cluster?: string;
  resourceType?: 'pod' | 'statefulset';
  resourceName?: string;
  namespace?: string;
  registryId?: string;
  repository?: string;
  schedule?: ScheduleConfig;
}

export interface RecoveryRecord {
  id: string;
  name: string;
  backupId: string;
  backupName: string;
  sourceCluster: string;
  targetCluster: string;
  resourceType: string;
  resourceName: string;
  namespace: string;
  recoveryType: 'restore' | 'migrate';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecoveryRequest {
  name: string;
  backupId: string;
  targetCluster: string;
  recoveryType: 'restore' | 'migrate';
  targetName?: string;
  targetNamespace?: string;
}

export interface CheckpointRestoreEvent {
  id: string;
  name: string;
  namespace: string;
  cluster: string;
  sourceCluster: string;
  sourceResource: string;
  sourceNamespace: string;
  targetCluster: string;
  resourceType: string;
  resourceName: string;
  status: string;
  phase: string;
  progress: number;
  message?: string;
  startTime?: string;
  completionTime?: string;
  createdAt: string;
  updatedAt: string;
  containerImages?: string[];
  backupRef?: any;
  spec?: any;
  conditions?: any[];
}

export interface ClusterInfo {
  name: string;
  type: 'management' | 'member';
  status: 'Ready' | 'NotReady' | 'Unknown';
  migrationControllerStatus: 'installed' | 'not-installed' | 'partial' | 'error' | 'unknown' | 'not-implemented';
  migrationControllerVersion?: string;
  kubeVersion?: string;
  nodeCount: number;
  lastChecked: string;
  error?: string;
}

// Registry APIs
export const getRegistries = async (): Promise<{ registries: RegistryCredentials[]; total: number }> => {
  const resp = await karmadaClient.get<IResponse<{ registries: RegistryCredentials[]; total: number }>>('/backup/registry');
  return resp.data.data;
};

export const getRegistry = async (id: string): Promise<RegistryCredentials> => {
  const resp = await karmadaClient.get<IResponse<RegistryCredentials>>(`/backup/registry/${id}`);
  return resp.data.data;
};

export const createRegistry = async (data: CreateRegistryRequest): Promise<RegistryCredentials> => {
  const resp = await karmadaClient.post<IResponse<RegistryCredentials>>('/backup/registry', data);
  return resp.data.data;
};

export const updateRegistry = async (id: string, data: UpdateRegistryRequest): Promise<RegistryCredentials> => {
  const resp = await karmadaClient.put<IResponse<RegistryCredentials>>(`/backup/registry/${id}`, data);
  return resp.data.data;
};

export const deleteRegistry = async (id: string): Promise<void> => {
  await karmadaClient.delete<IResponse<void>>(`/backup/registry/${id}`);
};

// Backup APIs
export const getBackups = async (): Promise<{ backups: BackupConfiguration[]; total: number }> => {
  const resp = await karmadaClient.get<IResponse<{ backups: BackupConfiguration[]; total: number }>>('/backup');
  return resp.data.data;
};

export const getBackup = async (id: string): Promise<BackupConfiguration> => {
  const resp = await karmadaClient.get<IResponse<BackupConfiguration>>(`/backup/${id}`);
  return resp.data.data;
};

export const createBackup = async (data: CreateBackupRequest): Promise<BackupConfiguration> => {
  const resp = await karmadaClient.post<IResponse<BackupConfiguration>>('/backup', data);
  return resp.data.data;
};

export const updateBackup = async (id: string, data: UpdateBackupRequest): Promise<BackupConfiguration> => {
  const resp = await karmadaClient.put<IResponse<BackupConfiguration>>(`/backup/${id}`, data);
  return resp.data.data;
};

export const deleteBackup = async (id: string): Promise<void> => {
  await karmadaClient.delete<IResponse<void>>(`/backup/${id}`);
};

export const executeBackup = async (id: string): Promise<void> => {
  await karmadaClient.post<IResponse<void>>(`/backup/${id}/execute`);
};

export const getResourcesInCluster = async (cluster: string, resourceType: string, namespace?: string): Promise<{ resources: any[]; total: number }> => {
  const params: Record<string, string> = { type: resourceType };
  if (namespace) {
    params.namespace = namespace;
  }
  const resp = await karmadaClient.get<IResponse<{ resources: any[]; total: number }>>(`/backup/clusters/${cluster}/resources`, { params });
  return resp.data.data;
};

// Recovery APIs
export const getRecoveryHistory = async (): Promise<{ recoveries: RecoveryRecord[]; total: number }> => {
  const resp = await karmadaClient.get<IResponse<{ recoveries: RecoveryRecord[]; total: number }>>('/backup/recovery');
  return resp.data.data;
};

export const getRecoveryRecord = async (id: string): Promise<RecoveryRecord> => {
  const resp = await karmadaClient.get<IResponse<RecoveryRecord>>(`/backup/recovery/${id}`);
  return resp.data.data;
};

export const createRecovery = async (data: CreateRecoveryRequest): Promise<RecoveryRecord> => {
  const resp = await karmadaClient.post<IResponse<RecoveryRecord>>('/backup/recovery', data);
  return resp.data.data;
};

export const executeRecovery = async (id: string): Promise<void> => {
  await karmadaClient.post<IResponse<void>>(`/backup/recovery/${id}/execute`);
};

export const cancelRecovery = async (id: string): Promise<void> => {
  await karmadaClient.post<IResponse<void>>(`/backup/recovery/${id}/cancel`);
};

export const deleteRecoveryRecord = async (id: string): Promise<void> => {
  await karmadaClient.delete<IResponse<void>>(`/backup/recovery/${id}`);
};

export const getBackupHistory = async (backupId: string): Promise<{ history: any[]; total: number }> => {
  const resp = await karmadaClient.get<IResponse<{ history: any[]; total: number }>>(`/backup/recovery/backup/${backupId}/history`);
  return resp.data.data;
};

// CheckpointRestore Events APIs
export const getCheckpointRestoreEvents = async (): Promise<{ events: CheckpointRestoreEvent[]; total: number }> => {
  const resp = await karmadaClient.get<IResponse<{ events: CheckpointRestoreEvent[]; total: number }>>('/backup/recovery/checkpoint-restore-events');
  return resp.data.data;
};

// Settings APIs
export const getClusters = async (): Promise<{ clusters: ClusterInfo[]; total: number }> => {
  const resp = await karmadaClient.get<IResponse<{ clusters: ClusterInfo[]; total: number }>>('/backup/settings/clusters');
  return resp.data.data;
};

export const getClusterDetail = async (name: string): Promise<ClusterInfo> => {
  const resp = await karmadaClient.get<IResponse<ClusterInfo>>(`/backup/settings/clusters/${name}`);
  return resp.data.data;
};

export const installController = async (clusterName: string, version?: string): Promise<void> => {
  await karmadaClient.post<IResponse<void>>('/backup/settings/clusters/install-controller', {
    clusterName,
    version,
  });
};

export const uninstallController = async (clusterName: string): Promise<void> => {
  await karmadaClient.post<IResponse<void>>('/backup/settings/clusters/uninstall-controller', {
    clusterName,
  });
};

export const checkControllerStatus = async (clusterName: string): Promise<any> => {
  const resp = await karmadaClient.get<IResponse<any>>(`/backup/settings/clusters/${clusterName}/controller-status`);
  return resp.data.data;
};

export const getControllerLogs = async (clusterName: string, lines: number = 100): Promise<string[]> => {
  const resp = await karmadaClient.get<IResponse<{ logs: string[] }>>(`/backup/settings/clusters/${clusterName}/controller-logs`, {
    params: { lines: lines.toString() }
  });
  return resp.data.data.logs;
};
