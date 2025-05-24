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
import {
  convertDataSelectQuery,
  DataSelectQuery,
  IResponse,
  karmadaClient,
  ObjectMeta,
  Selector,
  TypeMeta,
} from '@/services/base.ts';
import { getClusterApiPath } from '@/utils/cluster';

export enum Protocol {
  TCP = 'TCP',
  UDP = 'UDP',
  SCTP = 'SCTP',
}

export enum ServiceType {
  ClusterIP = 'ClusterIP',
  NodePort = 'NodePort',
  LoadBalancer = 'LoadBalancer',
  ExternalName = 'ExternalName',
}

export interface ServicePort {
  port: number;
  protocol: Protocol;
  nodePort: number;
}

export interface Endpoint {
  host: string;
  ports: ServicePort[];
}

export interface Service {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  internalEndpoint: Endpoint;
  externalEndpoints: Endpoint[];
  selector: Selector;
  type: ServiceType;
  clusterIP: string;
}

export interface ServiceRaw {
  apiVersion: string;
  kind: string;
  metadata: ObjectMeta;
  spec: {
    ports: ServicePort[];
    selector: Selector;
    type: ServiceType;
    clusterIP: string;
  };
  status: {
    loadBalancer: {
      ingress: Endpoint[];
    };
  };
}

export async function GetServices(params: {
  namespace?: string;
  cluster?: ClusterOption;
  keyword?: string;
}) {
  const { namespace, keyword, cluster } = params;
  const base_url = getClusterApiPath(cluster?.label || '', 'service');
  const url = namespace ? `${base_url}/${namespace}` : base_url;

  const requestData = {} as DataSelectQuery;
  if (keyword) {
    requestData.filterBy = ['name', keyword];
  }
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      services: Service[];
    }>
  >(url, {
    params: convertDataSelectQuery(requestData),
  });
  return resp.data;
}

export interface Ingress {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  selector: Selector;
  endpoints: {
    host: string | null;
    ports: string | null;
  }[];
}
export async function GetIngress(params: {
  namespace?: string;
  cluster?: ClusterOption;
  keyword?: string;
}) {
  const { namespace, keyword, cluster } = params;
  const base_url = getClusterApiPath(cluster?.label || '', 'ingress');
  const url = namespace ? `${base_url}/${namespace}` : base_url;

  const requestData = {} as DataSelectQuery;
  if (keyword) {
    requestData.filterBy = ['name', keyword];
  }
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      items: Ingress[];
    }>
  >(url, {
    params: convertDataSelectQuery(requestData),
  });
  return resp.data;
}

export const propagationpolicyKey = 'propagationpolicy.karmada.io/name';
// safely extract propagationpolicy
export const extractPropagationPolicy = (r: { objectMeta: ObjectMeta }) => {
  if (!r?.objectMeta?.annotations?.[propagationpolicyKey]) {
    return '';
  }
  return r?.objectMeta?.annotations?.[propagationpolicyKey];
};
