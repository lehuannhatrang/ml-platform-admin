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
  TypeMeta,
} from '@/services/base.ts';
import { getClusterApiPath } from '@/utils/cluster';

export interface Config {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
}

export async function GetConfigMaps(params: {
  namespace?: string;
  keyword?: string;
  cluster?: ClusterOption;
}) {
  const { namespace, keyword, cluster } = params;
  const base_url = getClusterApiPath(cluster?.label || '', 'configmap');
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
      items: Config[];
    }>
  >(url, {
    params: convertDataSelectQuery(requestData),
  });
  return resp.data;
}

export interface Secret {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  type?: string;
}

export async function GetSecrets(params: {
  namespace?: string;
  keyword?: string;
  cluster?: ClusterOption;
}) {
  const { namespace, keyword, cluster } = params;
  const base_url = getClusterApiPath(cluster?.label || '', 'secret');
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
      secrets: Secret[];
    }>
  >(url, {
    params: convertDataSelectQuery(requestData),
  });
  return resp.data;
}
