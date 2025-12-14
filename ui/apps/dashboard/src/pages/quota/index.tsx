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

import { useState } from 'react';
import { Typography, Tabs } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { GetDashboardConfig, GPUConfig } from '@/services/dashboard-config';
import Panel from '@/components/panel';
import { DEFAULT_GPU_CONFIG } from './utils';
import { GPUSlicingTab, QuotaManagementTab } from './components';

const { Title } = Typography;

// Main Quota Management Page
const QuotaManagement = () => {
  const [gpuConfig, setGpuConfig] = useState<GPUConfig>(DEFAULT_GPU_CONFIG);

  // Fetch dashboard config for GPU settings
  const { data: configData } = useQuery({
    queryKey: ['dashboardConfig'],
    queryFn: async () => {
      const response = await GetDashboardConfig();
      return response.data;
    },
  });

  // Update local state when config is loaded
  const currentGpuConfig = configData?.gpu_config || gpuConfig;

  const tabItems = [
    {
      key: 'quota-management',
      label: 'Quota Management',
      children: <QuotaManagementTab gpuConfig={currentGpuConfig} />,
    },
    {
      key: 'gpu-slicing',
      label: 'GPU Slicing',
      children: <GPUSlicingTab gpuConfig={currentGpuConfig} onSave={setGpuConfig} />,
    },
  ];

  return (
    <Panel showSelectCluster={true} allowSelectAllCluster={false}>
      <Title level={3} style={{ marginBottom: 24 }}>GPU Quota Management</Title>
      <Tabs 
        defaultActiveKey="quota-management" 
        items={tabItems}
        type="card"
      />
    </Panel>
  );
};

export default QuotaManagement;
