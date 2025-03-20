import { convertDataSelectQuery, DataSelectQuery, IResponse, karmadaClient } from "./base";

export interface ArgoProject {
  metadata: {
    name: string;
    namespace: string;
    labels?: {
      cluster: string;
      [key: string]: string;
    };
    [key: string]: any;
  };
  spec: {
    description?: string;
    sourceRepos?: string[];
    destinations?: Array<{
      namespace: string;
      server: string;
    }>;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ArgoApplication {
  metadata: {
    name: string;
    namespace: string;
    labels?: {
      cluster: string;
      [key: string]: string;
    };
    [key: string]: any;
  };
  spec: {
    project: string;
    source: {
      repoURL: string;
      path: string;
      targetRevision: string;
      [key: string]: any;
    };
    destination: {
      server: string;
      namespace: string;
      [key: string]: any;
    };
    syncPolicy?: {
      automated?: {
        prune: boolean;
        selfHeal: boolean;
        [key: string]: any;
      };
      [key: string]: any;
    };
    [key: string]: any;
  };
  status?: {
    sync: {
      status: string;
      [key: string]: any;
    };
    health: {
      status: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ArgoApplicationSet {
  metadata: {
    name: string;
    namespace: string;
    labels?: {
      cluster: string;
      [key: string]: string;
    };
    [key: string]: any;
  };
  spec: {
    generators?: Array<{
      clusterDecisionResource?: {
        configMapRef: string;
        labelSelector: {
          matchLabels: {
            [key: string]: string;
          };
        };
      };
      clusters?: {
        selector?: {
          matchLabels?: {
            [key: string]: string;
          };
          matchExpressions?: Array<{
            key: string;
            operator: string;
            values: string[];
          }>;
        };
        values?: {
          [key: string]: string;
        }[];
      };
      git?: {
        repoURL: string;
        revision: string;
        directories?: {
          path: string;
          exclude?: boolean;
        }[];
        files?: {
          path: string;
        }[];
      };
      list?: {
        elements: {
          [key: string]: any;
        }[];
      };
      [key: string]: any;
    }>;
    template: {
      metadata: {
        name: string;
        [key: string]: any;
      };
      spec: {
        project: string;
        source: {
          repoURL: string;
          targetRevision: string;
          path: string;
          [key: string]: any;
        };
        destination: {
          server: string;
          namespace: string;
          [key: string]: any;
        };
        [key: string]: any;
      };
      [key: string]: any;
    };
    [key: string]: any;
  };
  status?: {
    conditions?: Array<{
      type: string;
      message: string;
      status: string;
      lastTransitionTime: string;
      [key: string]: any;
    }>;
    [key: string]: any;
  };
}

export interface GetArgoApplicationsResponse {
  items: ArgoApplication[];
  totalItems: number;
}

export interface GetArgoProjectsResponse {
  items: ArgoProject[];
  totalItems: number;
}

export interface GetArgoApplicationSetsResponse {
  items: ArgoApplicationSet[];
  totalItems: number;
}

export interface ClusterFilter {
  value: string;
  label: string;
}

export interface ArgoFilter {
  selectedCluster: ClusterFilter;
  searchText: string;
}

export interface CreateArgoProjectRequest {
  metadata: {
    name: string;
    labels?: {
      [key: string]: string;
    };
  };
  spec: {
    description?: string;
    sourceRepos?: string[];
    destinations?: Array<{
      namespace: string;
      server: string;
    }>;
  };
}

export interface CreateArgoApplicationRequest {
  metadata: {
    name: string;
    labels?: {
      [key: string]: string;
    };
  };
  spec: {
    project: string;
    source: {
      repoURL: string;
      path: string;
      targetRevision: string;
    };
    destination: {
      server: string;
      namespace: string;
    };
    syncPolicy?: {
      automated?: {
        prune: boolean;
        selfHeal: boolean;
      };
    };
  };
}

/**
 * Creates a new ArgoCD Project in the specified cluster
 */
export async function CreateArgoProject(
  clusterName: string,
  data: CreateArgoProjectRequest
): Promise<IResponse<ArgoProject>> {
  const response = await karmadaClient.post(`/member/${clusterName}/argocd/project`, data);
  return response.data;
}

/**
 * Updates an existing ArgoCD Project in the specified cluster
 */
export async function UpdateArgoProject(
  clusterName: string,
  data: CreateArgoProjectRequest
): Promise<IResponse<ArgoProject>> {
  const response = await karmadaClient.put(`/member/${clusterName}/argocd/project/${data.metadata.name}`, data);
  return response.data;
}

/**
 * Deletes an ArgoCD Project in the specified cluster
 */
export async function DeleteArgoProject(
  clusterName: string,
  projectName: string
): Promise<IResponse<ArgoProject>> {
  const response = await karmadaClient.delete(`/member/${clusterName}/argocd/project/${projectName}`);
  return response.data;
}

/**
 * Creates a new ArgoCD Application in the specified cluster
 */
export async function CreateArgoApplication(
  clusterName: string,
  data: CreateArgoApplicationRequest
): Promise<IResponse<ArgoApplication>> {
  const response = await karmadaClient.post(`/member/${clusterName}/argocd/application`, data);
  return response.data;
}

/**
 * Updates an existing ArgoCD Application in the specified cluster
 */
export async function UpdateArgoApplication(
  clusterName: string,
  data: CreateArgoApplicationRequest
): Promise<IResponse<ArgoApplication>> {
  const response = await karmadaClient.put(`/member/${clusterName}/argocd/application/${data.metadata.name}`, data);
  return response.data;
}

export async function SyncArgoApplication(
  clusterName: string,
  applicationName: string
): Promise<IResponse<ArgoApplication>> {
  const response = await karmadaClient.post(`/member/${clusterName}/argocd/application/${applicationName}/sync`);
  return response.data;
}

/**
 * Deletes an ArgoCD Application in the specified cluster
 */
export async function DeleteArgoApplication(
  clusterName: string,
  applicationName: string
): Promise<IResponse<ArgoApplication>> {
  const response = await karmadaClient.delete(`/member/${clusterName}/argocd/application/${applicationName}`);
  return response.data;
}

export const GetArgoApplications = async (params: Partial<ArgoFilter> = {}) => {
  const { selectedCluster: cluster, searchText } = params;
  const requestData = {} as DataSelectQuery;
  if (searchText) {
    requestData.filterBy = ['name', searchText];
  }
  const url = cluster && cluster.value !== 'ALL' ? `/member/${cluster.label}/argocd/application` : '/aggregated/argocd/application';
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      items: ArgoApplication[];
    }>
  >(url, {
    params: convertDataSelectQuery(requestData),
  });
  return resp.data;
}

export const GetArgoProjects = async (params: Partial<ArgoFilter> = {}) => {
  const { selectedCluster: cluster, searchText } = params;
  const requestData = {} as DataSelectQuery;
  if (searchText) {
    requestData.filterBy = ['name', searchText];
  }
  const url = cluster && cluster.value !== 'ALL' ? `/member/${cluster.label}/argocd/project` : '/aggregated/argocd/project';
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      items: ArgoProject[];
    }>
  >(url, {
    params: convertDataSelectQuery(requestData),
  });
  return resp.data;
};

export async function GetArgoApplicationSets(filter: Partial<ArgoFilter> = {}) {
  const { selectedCluster: cluster, searchText } = filter;
  const requestData = {} as DataSelectQuery;
  if (searchText) {
    requestData.filterBy = ['name', searchText];
  }
  const url = cluster && cluster.value !== 'ALL' ? `/member/${cluster.label}/argocd/applicationset` : '/aggregated/argocd/applicationset';
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      items: ArgoApplicationSet[];
    }>
  >(url, {
    params: convertDataSelectQuery(requestData),
  });
  return resp.data;
}

/**
 * Gets detailed information about an ArgoCD Project and its applications
 */
export async function GetArgoProjectDetails(
  clusterName: string,
  projectName: string
): Promise<IResponse<{
  project: ArgoProject;
  applications: ArgoApplication[];
}>> {
  const response = await karmadaClient.get(`/member/${clusterName}/argocd/project/${projectName}`);
  return response.data;
}
