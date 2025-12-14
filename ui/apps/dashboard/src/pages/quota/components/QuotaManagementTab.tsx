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
import {
  Button,
  Table,
  Space,
  Tag,
  Popconfirm,
  Card,
  Typography,
  Empty,
  Row,
  Tooltip,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, InfoCircleOutlined, ScanOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GetQuotas,
  CreateQuota,
  UpdateQuota,
  DeleteQuota,
  ScanAndCreateQuotas,
  type QuotaAssignment,
  type QuotaAssignmentRequest,
  type QuotaResources,
} from '@/services/quota';
import { GetUsers, type User } from '@/services/users';
import { GPUConfig } from '@/services/dashboard-config';
import { useCluster } from '@/hooks';
import { DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import {
  slicesToFraction,
  formatGpuAsGiB,
  formatAsSlices,
  getMaxSlices,
  getDefaultSlices,
  fractionToSlices,
} from '../utils';
import GPUUsageDisplay from './GPUUsageDisplay';
import { CreateQuotaModal, EditQuotaModal, ScanAllModal } from './modals';

const { Title, Text } = Typography;

interface QuotaManagementTabProps {
  gpuConfig: GPUConfig;
}

const QuotaManagementTab = ({ gpuConfig }: QuotaManagementTabProps) => {
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isScanModalVisible, setIsScanModalVisible] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<QuotaAssignment | null>(null);
  const queryClient = useQueryClient();
  const { selectedCluster } = useCluster({});

  // Check if viewing aggregated (all clusters) view
  const isAggregatedView = selectedCluster.value === DEFAULT_CLUSTER_OPTION.value;
  const maxSlices = getMaxSlices(gpuConfig);
  const defaultSlices = getDefaultSlices(gpuConfig);

  // Fetch quota assignments
  const { data: quotasData, isLoading } = useQuery({
    queryKey: ['quotas', selectedCluster.value],
    queryFn: async () => {
      const response = await GetQuotas(selectedCluster);
      return response.data;
    },
    refetchInterval: 2500,
  });

  // Fetch users/profiles
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await GetUsers();
      return response.data;
    },
  });

  // Create quota mutation
  const createMutation = useMutation({
    mutationFn: (values: QuotaAssignmentRequest) => CreateQuota(values, selectedCluster),
    onSuccess: () => {
      message.success('Quota created successfully');
      setIsCreateModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['quotas'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to create quota');
    },
  });

  // Update quota mutation
  const updateMutation = useMutation({
    mutationFn: ({ profile, resources, parentQueue }: { profile: string; resources: QuotaResources; parentQueue?: string }) =>
      UpdateQuota(profile, resources, selectedCluster, parentQueue),
    onSuccess: () => {
      message.success('Quota updated successfully');
      setIsEditModalVisible(false);
      setSelectedAssignment(null);
      queryClient.invalidateQueries({ queryKey: ['quotas'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to update quota');
    },
  });

  // Delete quota mutation
  const deleteMutation = useMutation({
    mutationFn: (profile: string) => DeleteQuota(profile, selectedCluster),
    onSuccess: () => {
      message.success('Quota deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['quotas'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to delete quota');
    },
  });

  // Scan and create quotas mutation
  const scanMutation = useMutation({
    mutationFn: async () => {
      const gpuFraction = slicesToFraction(defaultSlices, gpuConfig);
      const response = await ScanAndCreateQuotas(gpuFraction, selectedCluster);
      return response.data;
    },
    onSuccess: (data) => {
      setIsScanModalVisible(false);
      if (data?.data?.created && data.data.created.length > 0) {
        message.success(`Created ${data.data.created.length} quota(s) successfully`);
      } else {
        message.info('No new quotas to create. All profiles already have quotas assigned.');
      }
      queryClient.invalidateQueries({ queryKey: ['quotas'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to scan and create quotas');
    },
  });

  const handleCreateQuota = (values: { profile: string; gpuSlices: number }) => {
    const gpuFraction = slicesToFraction(values.gpuSlices ?? 0, gpuConfig);
    
    const request: QuotaAssignmentRequest = {
      profile: values.profile,
      parentQueue: 'default-parent-queue',
      resources: {
        cpu: { quota: 0, limit: -1 },
        memory: { quota: 0, limit: -1 },
        gpu: { quota: gpuFraction, limit: gpuFraction },
      },
    };
    createMutation.mutate(request);
  };

  const handleEditQuota = (values: { gpuSlices: number }) => {
    if (selectedAssignment) {
      const gpuFraction = slicesToFraction(values.gpuSlices ?? 0, gpuConfig);
      
      const resources: QuotaResources = {
        cpu: { quota: 0, limit: -1 },
        memory: { quota: 0, limit: -1 },
        gpu: { quota: gpuFraction, limit: gpuFraction },
      };
      updateMutation.mutate({
        profile: selectedAssignment.profile,
        resources,
        parentQueue: selectedAssignment.parentQueue || 'default-parent-queue',
      });
    }
  };

  const handleEdit = (assignment: QuotaAssignment) => {
    setSelectedAssignment(assignment);
    setIsEditModalVisible(true);
  };

  const handleDelete = (profile: string) => {
    deleteMutation.mutate(profile);
  };

  const getAvailableProfiles = () => {
    if (!usersData) return [];

    const assignedProfiles = new Set(
      quotasData?.data?.assignments?.map((a: QuotaAssignment) => a.profile) || []
    );

    return usersData
      .filter((user: User) => user.profile)
      .map((user: User) => ({
        value: user.profile,
        label: `${user.username} (${user.email})`,
        email: user.email,
      }))
      .filter((profile: { value: string; label: string; email: string }) =>
        !assignedProfiles.has(profile.value)
      );
  };

  const missingQuotaCount = getAvailableProfiles().length;

  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (username: string) => username || '-',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (email: string) => email || '-',
    },
    ...(isAggregatedView ? [{
      title: 'Cluster',
      dataIndex: 'clusterName',
      key: 'clusterName',
      width: 120,
      render: (clusterName: string) => (
        <Tag color="geekblue">{clusterName || '-'}</Tag>
      ),
    }] : []),
    {
      title: 'GPU Quota',
      dataIndex: ['resources', 'gpu', 'quota'],
      key: 'gpuQuota',
      width: 150,
      render: (quota: number | undefined) => quota && quota > 0 && (
         <Space direction="horizontal" size={0}>
          <Tag color="yellow">{formatAsSlices(quota, gpuConfig)}</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {formatGpuAsGiB(quota, gpuConfig)}
          </Text>
        </Space>) || '-',
      sorter: (a: QuotaAssignment, b: QuotaAssignment) => {
        return (fractionToSlices(a.resources?.gpu?.quota ?? 0, gpuConfig) || 0) - (fractionToSlices(b.resources?.gpu?.quota ?? 0, gpuConfig) || 0);
      },
    },
    {
      title: (
        <span>
          Current Usage
        </span>
      ),
      key: 'usage',
      width: 200,
      render: (_: any, record: QuotaAssignment) => (
        <GPUUsageDisplay 
          usage={record.usage}
          limit={record.resources?.gpu?.limit}
          gpuConfig={gpuConfig}
        />
      ),
      sorter: (a: QuotaAssignment, b: QuotaAssignment) => {
        return (a.usage?.gpuAllocated ?? 0) - (b.usage?.gpuAllocated ?? 0);
      },
    },
    ...(!isAggregatedView ? [{
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: QuotaAssignment) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            size="small"
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete Quota"
            description={`Are you sure you want to delete the quota for "${record.profile}"?`}
            onConfirm={() => handleDelete(record.profile)}
            okText="Yes"
            cancelText="No"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <>
      <Card>
        <Row justify="space-between" align="middle">
          <div style={{ marginBottom: 24 }}>
            <Title level={4} style={{ margin: 0 }}>GPU Quota Assignments</Title>
            <Text type="secondary">
              1 slice = {gpuConfig.slice_size_gib} GB | Max {maxSlices} slices per GPU | Default: {defaultSlices} slice(s)
            </Text>
          </div>

          <Space style={{ marginBottom: 16 }}>
            {!isAggregatedView && (
              <>
                <Tooltip title={missingQuotaCount > 0 ? `${missingQuotaCount} profile(s) without quota` : 'All profiles have quotas'}>
                  <Button
                    icon={<ScanOutlined />}
                    onClick={() => setIsScanModalVisible(true)}
                    loading={scanMutation.isPending}
                  >
                    Scan All {missingQuotaCount > 0 && <Tag color="orange" style={{ marginLeft: 4 }}>{missingQuotaCount}</Tag>}
                  </Button>
                </Tooltip>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setIsCreateModalVisible(true)}
                >
                  Create Quota
                </Button>
              </>
            )}
          </Space>
        </Row>

        {isAggregatedView && (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Text type="secondary">
              <InfoCircleOutlined style={{ marginRight: 8 }} />
              Viewing quotas from all clusters. Select a specific cluster to create, edit, or delete quotas.
            </Text>
          </Card>
        )}

        <Table
          columns={columns}
          dataSource={quotasData?.data?.assignments || []}
          rowKey={(record) => `${record.profile}-${record.clusterName || 'default'}`}
          loading={isLoading}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} quotas`,
            defaultPageSize: 10,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: (
              <Empty
                description="No quota assignments yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                {!isAggregatedView && (
                  <Space>
                    <Button icon={<ScanOutlined />} onClick={() => setIsScanModalVisible(true)} loading={scanMutation.isPending}>
                      Scan All Profiles
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalVisible(true)}>
                      Create Quota
                    </Button>
                  </Space>
                )}
              </Empty>
            ),
          }}
        />
      </Card>

      {/* Create Quota Modal */}
      <CreateQuotaModal
        open={isCreateModalVisible}
        loading={createMutation.isPending}
        gpuConfig={gpuConfig}
        availableProfiles={getAvailableProfiles()}
        onOk={handleCreateQuota}
        onCancel={() => setIsCreateModalVisible(false)}
      />

      {/* Edit Quota Modal */}
      <EditQuotaModal
        open={isEditModalVisible}
        loading={updateMutation.isPending}
        gpuConfig={gpuConfig}
        assignment={selectedAssignment}
        onOk={handleEditQuota}
        onCancel={() => {
          setIsEditModalVisible(false);
          setSelectedAssignment(null);
        }}
      />

      {/* Scan All Modal */}
      <ScanAllModal
        open={isScanModalVisible}
        loading={scanMutation.isPending}
        gpuConfig={gpuConfig}
        missingCount={missingQuotaCount}
        onOk={() => scanMutation.mutate()}
        onCancel={() => setIsScanModalVisible(false)}
      />
    </>
  );
};

export default QuotaManagementTab;

