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

export enum RepositoryContentType {
  DEPLOYMENT = 'deployments',
  TEAM_BLUEPRINT = 'teamBlueprints',
  EXTERNAL_BLUEPRINT = 'externalBlueprints',
  ORGANIZATION_BLUEPRINT = 'organizationalBlueprints',
  FUNCTION = 'functions',
}

// Repository resource interfaces
export interface Repository {
  metadata: ObjectMeta;
  typeMeta: TypeMeta;
  spec: RepositorySpec;
  status?: RepositoryStatus;
}

export enum RepositoryContent {
  PACKAGE = 'Package',
  FUNCTION = 'Function',
}

export const REPOSITORY_GROUPS = [
  { value: RepositoryContentType.DEPLOYMENT, label: 'Deployment' },
  { value: RepositoryContentType.TEAM_BLUEPRINT, label: 'Team Blueprint' },
  { value: RepositoryContentType.EXTERNAL_BLUEPRINT, label: 'External Blueprint' },
  { value: RepositoryContentType.ORGANIZATION_BLUEPRINT, label: 'Organizational Blueprint' },
];

type ContentCloneToDetail = {
  content: RepositoryContentType;
  preferred: boolean;
  message?: string;
};

export type ContentDetails = {
  title: string;
  repositoryContent: RepositoryContent;
  contentSummary: RepositoryContentType;
  contentLink: string;
  description: string;
  isDeployment?: boolean;
  repositoryContentLabelValue?: string;
  notContent?: RepositoryContentType[];
  cloneTo: ContentCloneToDetail[];
};

export const RepositoryContentDetails: Record<RepositoryContentType, ContentDetails> = {
  [RepositoryContentType.DEPLOYMENT]: {
    title: 'Deployments',
    contentSummary: RepositoryContentType.DEPLOYMENT,
    repositoryContent: RepositoryContent.PACKAGE,
    contentLink: 'deployments',
    description:
      "Deployment Packages are packages ready for deployment to live clusters. If selected, you'll need to specify if the repository is for a development, staging, or production cluster.",
    isDeployment: true,
    cloneTo: [],
  },
  [RepositoryContentType.TEAM_BLUEPRINT]: {
    title: 'Team Blueprints',
    contentSummary: RepositoryContentType.TEAM_BLUEPRINT,
    repositoryContent: RepositoryContent.PACKAGE,
    contentLink: 'team-blueprints',
    description:
      'Team Blueprints are packages that a team in your organization owns. Deployment Packages can be created from packages in this repository.',
    notContent: [RepositoryContentType.ORGANIZATION_BLUEPRINT, RepositoryContentType.EXTERNAL_BLUEPRINT],
    cloneTo: [
      { content: RepositoryContentType.DEPLOYMENT, preferred: true },
      { content: RepositoryContentType.TEAM_BLUEPRINT, preferred: true },
    ],
  },
  [RepositoryContentType.ORGANIZATION_BLUEPRINT]: {
    title: 'Organizational Blueprints',
    contentSummary: RepositoryContentType.ORGANIZATION_BLUEPRINT,
    repositoryContent: RepositoryContent.PACKAGE,
    repositoryContentLabelValue: 'organizational-blueprints',
    contentLink: 'organizational-blueprints',
    description:
      'Organizational Blueprints are packages that your organization owns. An Organizational Blueprint package is expected to be cloned and customized in a Team Blueprint repository before a Deployment Package is created.',
    cloneTo: [
      {
        content: RepositoryContentType.DEPLOYMENT,
        preferred: false,
        message:
          'An Organizational Blueprint package is expected to be cloned and customized in a Team Blueprint repository before a Deployment Package is created.',
      },
      { content: RepositoryContentType.TEAM_BLUEPRINT, preferred: true },
      { content: RepositoryContentType.ORGANIZATION_BLUEPRINT, preferred: true },
    ],
  },
  [RepositoryContentType.EXTERNAL_BLUEPRINT]: {
    title: 'External Blueprints',
    contentSummary: RepositoryContentType.EXTERNAL_BLUEPRINT,
    repositoryContent: RepositoryContent.PACKAGE,
    repositoryContentLabelValue: 'external-blueprints',
    contentLink: 'external-blueprints',
    description:
      'External Blueprints are packages that your organization does not own. An External Blueprint package is expected to be cloned and customized in an Organization or Team Blueprint repository before a Deployment Package is created.',
    cloneTo: [
      {
        content: RepositoryContentType.DEPLOYMENT,
        preferred: false,
        message:
          'An External Blueprint is expected to be cloned and customized in an Organization or Team Blueprint repository before a Deployment Package is created.',
      },
      { content: RepositoryContentType.TEAM_BLUEPRINT, preferred: true },
      { content: RepositoryContentType.ORGANIZATION_BLUEPRINT, preferred: true },
      { content: RepositoryContentType.EXTERNAL_BLUEPRINT, preferred: true },
    ],
  },
  [RepositoryContentType.FUNCTION]: {
    title: 'Functions',
    contentSummary: RepositoryContentType.FUNCTION,
    repositoryContent: RepositoryContent.FUNCTION,
    contentLink: 'functions',
    description: 'Functions are containerized programs that can perform CRUD operations on KRM resources.',
    cloneTo: [],
  },
};

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
    `/mgmt-cluster/package/repository/default/${name}`
  );
  return resp.data;
}

export async function CreateRepository(repository: any) {
  const resp = await karmadaClient.post<IResponse<Repository>>(
    '/mgmt-cluster/package/repository/default',
    repository
  );
  return resp.data;
}

export async function UpdateRepository(name: string, repository: any) {
  const resp = await karmadaClient.put<IResponse<Repository>>(
    `/mgmt-cluster/package/repository/default/${name}`,
    repository
  );
  return resp.data;
}

export async function DeleteRepository(name: string) {
  const resp = await karmadaClient.delete<
    IResponse<{
      message: string;
    }>
  >(`/mgmt-cluster/package/repository/default/${name}`);
  return resp.data;
}


export function getRepositoryGroup(repo: Repository): RepositoryContentType {
  let group: RepositoryContentType = RepositoryContentType.ORGANIZATION_BLUEPRINT;

  if (repo.spec?.deployment === true) {
    group = RepositoryContentType.DEPLOYMENT;
  }
  else if (repo.metadata?.labels?.['kpt.dev/repository-content'] === 'external-blueprints') {
    group = RepositoryContentType.EXTERNAL_BLUEPRINT;
  }
  else if (repo.metadata?.annotations?.['nephio.org/staging'] === 'true') {
    group = RepositoryContentType.TEAM_BLUEPRINT;
  }

  return group;
}