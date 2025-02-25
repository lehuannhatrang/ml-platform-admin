import { IResponse, karmadaClient } from './base'; 

interface ConfigResponse {
  message: string;
}

export async function GetConfigMessage(): Promise<ConfigResponse> {
  const response = await karmadaClient.get<ConfigResponse>('/karmada-config');
  return response.data;
}

interface RunningPodsResponse {
  appLabels: string[];
}

export async function GetRunningPods(): Promise<RunningPodsResponse> {
  const response = await karmadaClient.get<RunningPodsResponse>('karmada-config/running-apps');
  return response.data;
}

interface PodDetailsResponse {
  pods: Array<{
    uid: string;
    creationTimestamp: string;
    generateName: string;
    labels: Record<string, string>;
    name: string;
  }>;
}

export async function GetPodDetails(podName: string): Promise<PodDetailsResponse> {
  const response = await karmadaClient.get<PodDetailsResponse>(`karmada-config/apps/${podName}`);
  return response.data;
}

interface PodLogsResponse {
  logs: string;
}

export async function GetPodLogs(podName: string): Promise<PodLogsResponse> {
  const response = await karmadaClient.get<PodLogsResponse>(`karmada-config/log/${podName}`);
  return response.data;
}

export async function restartDeployment(deploymentName: string): Promise<{ status: string }> {
  const response = await karmadaClient.get<{ status: string }>(`karmada-config/restart/${deploymentName}`);
  return response.data;
}

export async function checkDeploymentStatus(podName: string): Promise<{ status: string }> {
  const response = await karmadaClient.get<{ status: string }>(`karmada-config/status/${podName}`);
  return response.data;
}

export async function reinstallDeployment(podName: string): Promise<{ status: string }> {
  const response = await karmadaClient.delete<{ status: string }>(`karmada-config/reinstall/${podName}`);
  return response.data;
}

export async function GetPodYAML(podName: string) {
  const response = await karmadaClient.get(`/karmada-config/podinfo/${podName}`);
  return response.data;
}

export interface KarmadaHeaderProps {
  onTabChange: (key: string) => void;
  appName: string;
  podNames: string[];
}

export interface ComponentEditorDrawerProps {
  initialOpen: boolean;
  mode: 'edit' | 'detail';
  podName: string;
  namespace: string;
  onClose: () => void;
  yamlContent: string;
}

export async function UpdatePodYAML(podName: string , params: {
  yamlContent: string;
}): Promise<IResponse<string>> {
  try {
    const response = await karmadaClient.put<IResponse<string>>(
      `/karmada-config/podinfo/${podName}`,
      params
    );
    return response.data;
  } catch (error) {
    return {
      code: 500,
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      data: ''
    };
  }
}
export interface PodState {
  pods: string[];
  selectedPodDetails?: {
    uid: string;
    creationTimestamp: string;
    generateName: string;
    labels: Record<string, string>;
    name: string;
  } | null;
  podLogs: Record<string, string>;
  activeTab: string;
  podCount: number;
  podNames: string[];
}