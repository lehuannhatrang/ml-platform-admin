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
