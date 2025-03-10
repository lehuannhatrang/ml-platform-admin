import { ClusterOption } from "@/hooks/use-cluster";
import { IResponse, karmadaClient, ObjectMeta } from "./base";

export interface ApiVersion {
  group: string;
  versions: string[];
  cluster: string;
}

export type CustomResourceDefinition = {
    apiVersion: string;
    kind: string;
    metadata: ObjectMeta;
    spec: {
        group: string;
        scope: string;
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
  const url = cluster && cluster.value !== 'ALL' ? `/member/${cluster.label}/customresource/apiVersion` : '/aggregated/customresource/apiVersion';
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
}) {
    const { cluster } = params;
    const url = cluster && cluster.value !== 'ALL' ? `/member/${cluster.label}/customresource/definition` : '/aggregated/customresource/definition';
    const resp = await karmadaClient.get<
      IResponse<{
        errors: string[];
        listMeta: {
          totalItems: number;
        };
        items: CustomResourceDefinition[];
      }>
    >(url);
    return resp.data;
}

export async function GetCustomResourceDefinitionByGroup(params: {
  cluster?: ClusterOption;
}) {
    const { cluster } = params;
    const url = cluster && cluster.value !== 'ALL' ? `/member/${cluster.label}/customresource/definition` : '/aggregated/customresource/definition';
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
  const url = `/member/${cluster}/customresource/resource`;
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
