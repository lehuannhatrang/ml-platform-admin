import { IResponse, karmadaClient } from "./base";

export interface MonitoringConfig {
    name: string;
    type: MonitoringType;
    endpoint: string;
    token: string;
}

export enum MonitoringType {
  GRAFANA = 'grafana',
}

interface AddMonitoringConfigProps {
  type: MonitoringType;
  name: string;
  endpoint: string;
  token: string;
}
    
export interface MonitoringDashboard {
  id: number;
  uid: string;
  title: string;
  url: string;
  folderId: number;
  type: MonitoringType;
  folderTitle?: string;
}

export const GetMonitoringConfig = async () => {
  const url = `/setting/monitoring`;
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      monitorings: MonitoringConfig[];
    }>
  >(url);
  return resp.data;
}

export const AddMonitoringConfig = async ({ type, name, endpoint, token }: AddMonitoringConfigProps) => {
  const url = `/setting/monitoring/${type}`;
  const resp = await karmadaClient.post<IResponse<MonitoringConfig>>(url, { name, endpoint, token });
  return resp.data;
}

export const GetMonitoringDashboards = async ({name}: { name: string }) => {
  const url = `/setting/monitoring/${name}/dashboards`;
  const resp = await karmadaClient.get<
    IResponse<{
      errors: string[];
      dashboards: MonitoringDashboard[];
    }>
  >(url);
  return resp.data;
}

interface SaveDashboardProps {
  name: string;
  url: string;
}

export const SaveMonitoringDashboard = async ({ name, url }: SaveDashboardProps) => {
  const apiUrl = `/overview/monitoring/dashboard`;
  const resp = await karmadaClient.post<IResponse<{ message: string }>>(apiUrl, {
    name,
    url,
  });
  return resp.data;
}

export const DeleteMonitoringDashboard = async ({ name, url }: { name: string; url: string }) => {
  const apiUrl = `/overview/monitoring/dashboard/${name}?url=${encodeURIComponent(url)}`;
  const resp = await karmadaClient.delete<IResponse<{ message: string }>>(apiUrl);
  return resp.data;
}

export const DeleteMonitoringSource = async ({ name, endpoint }: { name: string; endpoint: string }) => {
  const apiUrl = `/setting/monitoring/source/${name}?endpoint=${encodeURIComponent(endpoint)}`;
  const resp = await karmadaClient.delete<IResponse<{ message: string }>>(apiUrl);
  return resp.data;
}