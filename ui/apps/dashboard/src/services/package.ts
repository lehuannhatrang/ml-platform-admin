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

// Repository resource interfaces
export interface Repository {
    metadata: ObjectMeta;
    typeMeta: TypeMeta;
    spec: RepositorySpec;
    status?: RepositoryStatus;
}

export interface RepositorySpec {
  description?: string;
  content?: string;
  git?: GitRepository;
  oci?: OciRepository;
  type: string;
  [key: string]: any; // For other fields that might be in the spec
}

export interface GitRepository {
  repo: string;
  directory?: string;
  branch?: string;
  tag?: string;
  commit?: string;
  secretRef?: {
    name: string;
  };
  [key: string]: any;
}

export interface OciRepository {
  registry: string;
  [key: string]: any;
}

export interface RepositoryStatus {
  ready: boolean;
  reason?: string;
  message?: string;
  [key: string]: any;
}

// PackageRev resource interfaces
export interface PackageRev {
  metadata: ObjectMeta;
  typeMeta: TypeMeta;
  spec: PackageRevSpec;
  status?: PackageRevStatus;
}

export interface PackageRevSpec {
  packageName: string;
  revision: string;
  repository: string;
  tasks?: any[];
  [key: string]: any;
}

export interface PackageRevStatus {
  revision: string;
  workloadIdentity?: string;
  [key: string]: any;
}

export enum PackageRevisionLifecycle {
  DRAFT = 'Draft',
  PROPOSED = 'Proposed',
  PUBLISHED = 'Published',
}

// Repository API methods
export async function GetRepositories(query: DataSelectQuery) {
  const resp = await karmadaClient.get<
    IResponse<{
      resources: Repository[];
      totalResources: number;
    }>
  >('/mgmt-cluster/package/repository', {
    params: convertDataSelectQuery(query),
  });
  return resp.data;
}

export async function GetRepository(name: string) {
  const resp = await karmadaClient.get<IResponse<Repository>>(
    `/mgmt-cluster/package/repository/${name}`
  );
  return resp.data;
}

export async function CreateRepository(repository: any) {
  const resp = await karmadaClient.post<IResponse<Repository>>(
    '/mgmt-cluster/package/repository',
    repository
  );
  return resp.data;
}

export async function UpdateRepository(name: string, repository: any) {
  const resp = await karmadaClient.put<IResponse<Repository>>(
    `/mgmt-cluster/package/repository/${name}`,
    repository
  );
  return resp.data;
}

export async function DeleteRepository(name: string) {
  const resp = await karmadaClient.delete<
    IResponse<{
      message: string;
    }>
  >(`/mgmt-cluster/package/repository/${name}`);
  return resp.data;
}

// PackageRev API methods
export async function GetPackageRevs() {
  const resp = await karmadaClient.get<{
    items: PackageRev[];
    totalResources: number;
  }>('/mgmt-cluster/porch/packagerevision');
  return resp.data;
}

export interface PackageResource {
  apiVersion: string;
  kind: string;
  metadata: ObjectMeta;
  spec?: any;
  [key: string]: any;
}

export interface PackageRevisionResources {
  apiVersion: string;
  kind: string;
  metadata: ObjectMeta;
  spec?: {
    packageName: string;
    repository: string;
    revision: string;
    workspaceName?: string;
    resources: {
      [key: string]: string;
    };
  }
  status: {
    renderStatus: {
      result: any
      error: string
    }
  };
}

// Fetch package revision resources
export async function GetPackageRevisionResources(name: string) {
  const resp = await karmadaClient.get<PackageRevisionResources>(`/mgmt-cluster/porch/packagerevisionresources/${name}`);
  return resp.data;
}

export async function GetPackageRev(name: string) {
  const resp = await karmadaClient.get<PackageRev>(
    `/mgmt-cluster/porch/packagerevision/${name}`
  );
  return resp.data;
}

export async function CreatePackageRev(packageRev: any) {
  const resp = await karmadaClient.post<IResponse<PackageRev>>(
    '/mgmt-cluster/package/packagerevision',
    packageRev
  );
  return resp.data;
}

export async function UpdatePackageRev(name: string, packageRev: any) {
  const resp = await karmadaClient.put<IResponse<PackageRev>>(
    `/mgmt-cluster/package/packagerev/${name}`,
    packageRev
  );
  return resp.data;
}

export async function DeletePackageRev(name: string) {
  const resp = await karmadaClient.delete<
    IResponse<{
      message: string;
    }>
  >(`/mgmt-cluster/package/packagerev/${name}`);
  return resp.data;
}
