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

export interface CloudCredential {
  name: string;
  provider: string;
  description?: string;
  createdAt: string;
  labels?: Record<string, string>;
}

export interface CloudCredentialList {
  credentials: CloudCredential[];
  totalItems: number;
}

export interface CreateCredentialRequest {
  name: string;
  provider: string;
  credentials: string;
  description?: string;
}

export interface UpdateCredentialRequest {
  credentials?: string;
  description?: string;
}

export interface CredentialContent {
  name: string;
  provider: string;
  credentials: string;
  description?: string;
}

export async function GetCloudCredentials() {
  const resp = await karmadaClient.get<IResponse<CloudCredentialList>>('/cloudcredentials');
  return resp.data;
}

export async function GetCloudCredential(name: string) {
  const resp = await karmadaClient.get<IResponse<CloudCredential>>(`/cloudcredentials/${name}`);
  return resp.data;
}

export async function GetCloudCredentialContent(name: string) {
  const resp = await karmadaClient.get<IResponse<CredentialContent>>(`/cloudcredentials/${name}/content`);
  return resp.data;
}

export async function CreateCloudCredential(params: CreateCredentialRequest) {
  const resp = await karmadaClient.post<IResponse<CloudCredential>>('/cloudcredentials', params);
  return resp.data;
}

export async function UpdateCloudCredential(name: string, params: UpdateCredentialRequest) {
  const resp = await karmadaClient.put<IResponse<CloudCredential>>(`/cloudcredentials/${name}`, params);
  return resp.data;
}

export async function DeleteCloudCredential(name: string) {
  const resp = await karmadaClient.delete<IResponse<{ message: string }>>(`/cloudcredentials/${name}`);
  return resp.data;
}




