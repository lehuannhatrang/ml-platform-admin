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
  DataSelectQuery,
  IResponse,
  ObjectMeta,
  TypeMeta,
  convertDataSelectQuery,
  karmadaClient,
} from './base';
import { ClusterOption } from '@/hooks/use-cluster';

export interface Namespace {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  phase: string;
  skipAutoPropagation: boolean;
}

export async function GetNamespaces(query: DataSelectQuery, cluster?: ClusterOption) {
  const apiPath = cluster && cluster.value !== 'ALL' ? `/member/${cluster.label}/namespace` : '/aggregated/namespace'; 
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      namespaces: Namespace[];
    }>
  >(apiPath, {
    params: convertDataSelectQuery(query),
  });
  return resp.data;
}

export async function CreateNamespace(params: {
  name: string;
  skipAutoPropagation: boolean;
}) {
  const resp = await karmadaClient.post<IResponse<string>>(
    '/namespace',
    params,
  );
  return resp.data;
}

export async function CreateClusterNamespace(params: {
  name: string;
  cluster: string;
}) {
  const resp = await karmadaClient.post<IResponse<string>>(
    `/member/${params.cluster}/namespace`,
    params,
  );
  return resp.data;
}

export async function DeleteNamespace(params: {
  name: string;
  cluster: string;
}) {
  const resp = await karmadaClient.delete<IResponse<string>>(
    `/member/${params.cluster}/namespace/${params.name}`
  );
  return resp.data;
}
