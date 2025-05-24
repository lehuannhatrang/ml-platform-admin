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
import { IResponse, ObjectMeta, TypeMeta, karmadaClient } from './base';
import { AxiosResponse } from 'axios';
import { getClusterApiPath } from '@/utils/cluster';

export interface PersistentVolumeSpec {
  capacity: {
    storage: string;
  };
  accessModes: string[];
  persistentVolumeReclaimPolicy: string;
  storageClassName: string;
  volumeMode: string;
  claimRef?: {
    kind: string;
    namespace: string;
    name: string;
    uid: string;
  };
}

export interface PersistentVolumeStatus {
  phase: string;
  message?: string;
  reason?: string;
}

export interface PersistentVolume {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  spec: PersistentVolumeSpec;
  status: PersistentVolumeStatus;
}

export interface PersistentVolumeList {
  listMeta: {
    totalItems: number;
  };
  persistentVolumes: PersistentVolume[];
  errors: any[];
}

export interface GetPersistentVolumesParams {
  namespace?: string;
  keyword?: string;
  cluster: ClusterOption;
}

export const GetPersistentVolumes = async (
  params: GetPersistentVolumesParams
): Promise<AxiosResponse<IResponse<PersistentVolumeList>>> => {
  const { namespace, cluster } = params;

  const baseUrl = getClusterApiPath(cluster?.label || '', 'persistentvolume');
  
  if (namespace) {
    return karmadaClient.get(`${baseUrl}/${namespace}`);
  }
  return karmadaClient.get(baseUrl);
};

export const GetPersistentVolumeDetail = async (
  clusterName: string,
  namespace: string,
  name: string
): Promise<AxiosResponse<IResponse<PersistentVolume>>> => {
  return karmadaClient.get(`${getClusterApiPath(clusterName, 'persistentvolume')}/${namespace}/${name}`);
};
