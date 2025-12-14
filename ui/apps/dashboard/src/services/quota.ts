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

import { ClusterOption } from '@/hooks/use-cluster';
import { IResponse, karmadaClient } from './base';
import { getClusterApiPath } from '@/utils/cluster';

// Resource quota values: positive numbers for limits, 0 for no quota, -1 for unlimited
export interface ResourceQuota {
  quota: number;
  limit: number;
}

export interface QuotaResources {
  cpu?: ResourceQuota;
  memory?: ResourceQuota;
  gpu?: ResourceQuota;
}

// Usage status from the Queue CR status field
export interface QuotaUsage {
  gpuAllocated: number;     // GPU allocation in percentage (0-1 scale)
  gpuMemoryRequest: number; // GPU memory requested in MB
}

export interface QuotaAssignment {
  profile: string;
  queueName: string;
  parentQueue?: string;
  resources: QuotaResources;
  usage?: QuotaUsage;
  username?: string;
  email?: string;
  createdAt?: string;
  clusterName?: string;
}

export interface QuotaListResponse {
  assignments: QuotaAssignment[];
  total: number;
}

export interface QuotaAssignmentRequest {
  profile: string;
  parentQueue?: string;
  resources: QuotaResources;
}

/**
 * Get all quota assignments
 * Routes to /aggregated/quota, /member/{cluster}/quota, or /mgmt-cluster/quota based on cluster
 */
export async function GetQuotas(cluster?: ClusterOption) {
  const url = getClusterApiPath(cluster?.value || '', 'quota');
  return karmadaClient.get<IResponse<QuotaListResponse>>(url);
}

/**
 * Get quota for a specific profile
 */
export async function GetQuota(profile: string, cluster?: ClusterOption) {
  const url = getClusterApiPath(cluster?.value || '', 'quota');
  return karmadaClient.get<IResponse<QuotaAssignment>>(`${url}/${profile}`);
}

/**
 * Create quota for a profile
 */
export async function CreateQuota(data: QuotaAssignmentRequest, cluster?: ClusterOption) {
  const url = getClusterApiPath(cluster?.value || '', 'quota', false);
  return karmadaClient.post<IResponse<QuotaAssignment>>(url, data);
}

/**
 * Update quota for a specific profile
 */
export async function UpdateQuota(profile: string, resources: QuotaResources, cluster?: ClusterOption, parentQueue?: string) {
  const url = getClusterApiPath(cluster?.value || '', 'quota', false);
  return karmadaClient.put<IResponse<QuotaAssignment>>(`${url}/${profile}`, {
    profile,
    parentQueue,
    resources,
  });
}

/**
 * Delete quota for a profile
 */
export async function DeleteQuota(profile: string, cluster?: ClusterOption) {
  const url = getClusterApiPath(cluster?.value || '', 'quota', false);
  return karmadaClient.delete<IResponse<{ message: string }>>(`${url}/${profile}`);
}

export interface BatchCreateQuotaResponse {
  created: string[];
  failed: string[];
  skipped: string[];
  total: number;
}

/**
 * Scan for profiles without quotas and create default quotas for them
 */
export async function ScanAndCreateQuotas(gpuFraction: number, cluster?: ClusterOption) {
  const url = getClusterApiPath(cluster?.value || '', 'quota/scan-and-create', false);
  return karmadaClient.post<IResponse<BatchCreateQuotaResponse>>(url, {
    gpuFraction,
  });
}
