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

import {
  convertDataSelectQuery,
  DataSelectQuery,
  IResponse,
  karmadaClient,
  RollingUpdateStrategy,
  Selector,
  WorkloadKind,
} from '@/services/base.ts';
import { ObjectMeta, TypeMeta } from '@/services/base';
import { ClusterOption } from '@/hooks/use-cluster';
import { getClusterApiPath } from '@/utils/cluster';

export enum ResourceConditionType {
  Initialized = 'Initialized',
  PodScheduled = 'PodScheduled',
  ContainersReady = 'ContainersReady',
  Ready = 'Ready',
}

export interface ResourceCondition {
  type: ResourceConditionType
  status: string
  lastProbeTime: string
  lastTransitionTime: string
}

export interface PodWorkload {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  spec: any;
  status:  { conditions: ResourceCondition[] }
}

export interface DeploymentWorkload {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  pods: PodStatus;
  containerImages: string[];
  initContainerImages: any;
}

export interface StatefulsetWorkload {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  podInfo: PodStatus;
  containerImages: string[];
  initContainerImages: any;
}
export type Workload = PodWorkload |DeploymentWorkload | StatefulsetWorkload;

export interface PodStatus {
  current: number;
  desired: number;
  running: number;
  pending: number;
  failed: number;
  succeeded: number;
  warnings: any[];
}

export type PodDetail = {
  metadata: ObjectMeta;
  spec: any;
  status: any;
  hostIP: string;
  podIP?: string;
  podIPs?: any[];
  startTime?: string;
  containerStatuses?: any[];
  qosClass?: string;
}

export interface WorkloadStatus {
  running: number;
  pending: number;
  failed: number;
  succeeded: number;
  terminating: number;
}

export async function GetWorkloads(params: {
  namespace?: string;
  cluster?: ClusterOption;
  kind: WorkloadKind;
  keyword?: string;
}) {
  const { kind, namespace, cluster } = params;
  const requestData = {} as DataSelectQuery;
  if (params.keyword) {
    requestData.filterBy = ['name', params.keyword];
  }
  const base_url = getClusterApiPath(cluster?.label || '', kind);
  const url = namespace ? `${base_url}/${namespace}` : base_url;
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      status: WorkloadStatus;
      deployments?: Workload[];
      statefulSets?: Workload[];
      daemonSets?: Workload[];
      jobs?: Workload[];
      items?: Workload[];
    }>
  >(url, {
    params: convertDataSelectQuery(requestData),
  });
  return resp.data;
}

export type ContainerStatuses = {
  name: string;
  state: {
    running: {
      startedAt: string
    }
  };
  lastState: any;
  ready: boolean;
  restartCount: number;
  image: string;
  imageID: string;
  containerID: string;
  started: boolean
}

export type WorkloadDetail = {
  objectMeta?: ObjectMeta;
  typeMeta?: TypeMeta;
  podList?: {items: PodWorkload[]};
  pods?: PodStatus;
  containerImages?: string[];
  initContainerImages?: any;
  selector?: Selector;
  statusInfo?: WorkloadStatusInfo;
  conditions?: any[];
  strategy?: string;
  minReadySeconds?: number;
  rollingUpdateStrategy?: RollingUpdateStrategy;
  revisionHistoryLimit?: number;
  metadata?: ObjectMeta;
  spec?: any;
  status?: {
    phase: string;
    conditions: any[];
    hostIP: string;
    podIP: string;
    podIPs: any[];
    startTime: string;
    containerStatuses?: ContainerStatuses[];
  }
}

export interface WorkloadStatusInfo {
  replicas: number;
  updated: number;
  available: number;
  unavailable: number;
}

export type ContainerLogs = {
  logs: string;
  page: number;
  totalPages: number;
  totalLines: number;
}

export async function GetWorkloadDetail(params: {
  namespace: string;
  name: string;
  kind: WorkloadKind;
  cluster: string;
}) {
  // /deployment/:namespace/:deployment
  const { kind, name, namespace, cluster } = params;
  const url = getClusterApiPath(cluster, `${kind}/${namespace}/${name}`);
  const resp = await karmadaClient.get<
    IResponse<
      {
        errors: string[];
      } & WorkloadDetail
    >
  >(url);

  const data = resp.data;

  if (!data.data?.objectMeta && data.data?.metadata) {
    data.data.objectMeta = data.data.metadata;
  }

  return data;
}

export async function GetContainerLogs(params: {
  namespace: string;
  name: string;
  container: string;
  cluster: string;
  page: number;
}) {
  const { namespace, name, container, cluster, page } = params;
  const url = getClusterApiPath(cluster, `pod/${namespace}/${name}/logs`);
  const resp = await karmadaClient.get<
    IResponse<
      {
        errors: string[];
      } & ContainerLogs
    >
  >(url, {
    params: {
      container,
      page
    },
  });
  return resp.data;
}

export interface WorkloadEvent {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  message: string;
  sourceComponent: string;
  sourceHost: string;
  object: string;
  objectKind: string;
  objectName: string;
  objectNamespace: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  reason: string;
  type: string;
}

export async function GetWorkloadEvents(params: {
  namespace: string;
  name: string;
  kind: WorkloadKind;
  cluster: string;
}) {
  const { kind, name, namespace, cluster } = params;
  const url = getClusterApiPath(cluster, `${kind}/${namespace}/${name}/event`);
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      events: WorkloadEvent[];
    }>
  >(url);
  return resp.data;
}

export async function CreateDeployment(params: {
  namespace: string;
  name: string;
  content: string;
}) {
  const resp = await karmadaClient.post<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      events: WorkloadEvent[];
    }>
  >(`/deployment`, params);
  return resp.data;
}

/**
 * Restart a deployment by updating the kubectl.kubernetes.io/restartedAt annotation
 */
export async function RestartDeployment(params: {
  namespace: string;
  name: string;
  cluster: string;
}) {
  const { namespace, name, cluster } = params;
  const url = `${getClusterApiPath(cluster, `deployment/${namespace}/${name}/restart`)}`;
  const resp = await karmadaClient.post<
    IResponse<{
      message: string;
      timestamp: string;
    }>
  >(url);
  return resp.data;
}
