import { getClusterApiPath } from "@/utils/cluster";
import { ClusterOption } from "../hooks/use-cluster";
import { convertDataSelectQuery, DataSelectQuery, IResponse, karmadaClient, ObjectMeta } from "./base";

export interface ApiVersion {
  group: string;
  versions: string[];
  cluster: string;
}

export enum CustomResourceDefinitionScope {
  Cluster = 'Cluster',
  Namespaced = 'Namespaced',
}

export type CustomResourceDefinition = {
    apiVersion: string;
    kind: string;
    metadata: ObjectMeta;
    spec: {
        group: string;
        scope: CustomResourceDefinitionScope;
    };
    acceptedNames: {
        kind: string;
        listKind: string;
        plural: string;
        singular: string;
    };

}

export type CustomResourceDefinitionByGroup = {
  cluster: string;
  group: string;
  count: number;
  crds: CustomResourceDefinition[];
}

export async function GetApiVersions(params: {
  cluster?: ClusterOption;
}) {
  const { cluster } = params;
  const url = getClusterApiPath(cluster?.label || '', 'customresource/apiVersion');
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      listMeta: {
        totalItems: number;
      };
      items: ApiVersion[];
    }>
  >(url);
  return resp.data;
}

export async function GetCustomResourceDefinitions(params: {
  cluster?: ClusterOption;
  keyword?: string;
}) {
    const { cluster, keyword } = params;
    const requestData = {} as DataSelectQuery;
    if (keyword) {
      requestData.filterBy = ['name', keyword];
    }
    const url = getClusterApiPath(cluster?.label || '', 'customresource/definition');
    const resp = await karmadaClient.get<
      IResponse<{
        errors: string[];
        listMeta: {
          totalItems: number;
        };
        items: CustomResourceDefinition[];
      }>
    >(url, {
      params: convertDataSelectQuery(requestData),
    });
    return resp.data;
}

export type CustomResourceDefinitionDetail = {
  apiVersion: string;
  kind: string;
  metadata: ObjectMeta;
  spec: any;
  status: {
    acceptedNames: {
      kind: string;
      listKind: string;
      plural: string;
      singular: string;
    };
    conditions: {
      type: string;
      status: string;
      reason: string;
      message: string;
    }[];
  }
  storedVersions: string[];
}

export async function GetCustomResourceDefinitionByName(params: {
  cluster: string;
  crdName: string;
}) {
    const { cluster, crdName } = params;
    const url = getClusterApiPath(cluster, 'customresource/definition') + `/${crdName}`;
    const resp = await karmadaClient.get<
      IResponse<{
        errors: string[];
        crd: CustomResourceDefinitionDetail;
      }>
    >(url);
    return resp.data;
}

export async function UpdateCustomResourceDefinition(params: {
  cluster: string;
  crdName: string;
  crdData: any;
}) {
    const { cluster, crdName, crdData } = params;
    const url = getClusterApiPath(cluster, 'customresource/definition') + `/${crdName}`;
    const resp = await karmadaClient.put<
      IResponse<{
        errors: string[];
        crd: any;
      }>
    >(url, crdData);
    return resp.data;
}

export async function CreateCustomResourceDefinition(params: {
  cluster: string;
  crdData: any;
}) {
    const { cluster, crdData } = params;
    const url = getClusterApiPath(cluster, 'customresource/definition');
    const resp = await karmadaClient.post<
      IResponse<{
        errors: string[];
        crd: any;
      }>
    >(url, crdData);
    return resp.data;
}

export async function GetCustomResourceDefinitionByGroup(params: {
  cluster?: ClusterOption;
}) {
    const { cluster } = params;
    const url = getClusterApiPath(cluster?.label || '', 'customresource/definition');
    const resp = await karmadaClient.get<
      IResponse<{
        errors: string[];
        listMeta: {
          totalItems: number;
        };
        groups: CustomResourceDefinitionByGroup[];
      }>
    >(url, {
      params: {
        groupBy: 'group'
      }
    });
    return resp.data;
}

export interface CustomResource {
  apiVersion: string;
  kind: string;
  metadata: ObjectMeta;
  spec: any;
  status?: any;
}

export async function GetCustomResources(params: {
  cluster: string;
  group: string;
  crd: string;
}) {
  const { cluster, group, crd } = params;
  const url = getClusterApiPath(cluster, 'customresource/resource');
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      items: CustomResource[];
      totalItems: number;
    }>
  >(url, {
    params: {
      group,
      crd
    }
  })
  return resp.data;
}
