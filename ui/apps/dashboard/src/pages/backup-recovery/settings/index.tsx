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

import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Badge,
  Modal,
  message,
  Popconfirm,
  Tooltip,
  Alert,
  Spin
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getClusters,
  installController,
  uninstallController,
  checkControllerStatus,
  getControllerLogs,
  type ClusterInfo
} from '@/services/backup-recovery';
import Panel from '@/components/panel';


const SettingsPage: React.FC = () => {
  const [selectedVersion, _setSelectedVersion] = useState('v2.0');
  const [logsModalVisible, setLogsModalVisible] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<string>('');
  const queryClient = useQueryClient();

  // Fetch clusters
  const { data: clusters, isLoading } = useQuery({
    queryKey: ['clusters'],
    queryFn: getClusters,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch controller logs
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['controller-logs', selectedCluster],
    queryFn: () => getControllerLogs(selectedCluster),
    enabled: !!selectedCluster && logsModalVisible,
  });

  // Mutations
  const installMutation = useMutation({
    mutationFn: ({ clusterName, version }: { clusterName: string; version: string }) =>
      installController(clusterName, version),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      message.success(`Migration controller installation started on ${variables.clusterName}`);
    },
    onError: (error: any, variables) => {
      message.error(`Failed to install controller on ${variables.clusterName}: ${error.message}`);
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: uninstallController,
    onSuccess: (_, clusterName) => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      message.success(`Migration controller uninstallation started on ${clusterName}`);
    },
    onError: (error: any, clusterName) => {
      message.error(`Failed to uninstall controller on ${clusterName}: ${error.message}`);
    },
  });

  const checkStatusMutation = useMutation({
    mutationFn: checkControllerStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      message.success('Controller status updated');
    },
    onError: (error: any) => {
      message.error(`Failed to check controller status: ${error.message}`);
    },
  });

  const handleInstall = (clusterName: string) => {
    installMutation.mutate({ clusterName, version: selectedVersion });
  };

  const handleUninstall = (clusterName: string) => {
    uninstallMutation.mutate(clusterName);
  };

  const handleCheckStatus = (clusterName: string) => {
    checkStatusMutation.mutate(clusterName);
  };

  const handleViewLogs = (clusterName: string) => {
    setSelectedCluster(clusterName);
    setLogsModalVisible(true);
  };

  const getClusterTypeTag = (type: string) => {
    return type === 'management' ?
      <Tag color="purple">Management</Tag> :
      <Tag color="blue">Member</Tag>;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'Ready': { status: 'success', text: 'Ready' },
      'NotReady': { status: 'error', text: 'Not Ready' },
      'Unknown': { status: 'default', text: 'Unknown' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] ||
      { status: 'default', text: status };

    return <Badge status={config.status as any} text={config.text} />;
  };

  const getControllerStatusTag = (status: string, version?: string) => {
    const statusConfig = {
      'installed': {
        color: 'green',
        icon: <CheckCircleOutlined />,
        text: `Installed ${version ? `(${version})` : ''}`
      },
      'not-installed': {
        color: 'orange',
        icon: <ExclamationCircleOutlined />,
        text: 'Not Installed'
      },
      'error': {
        color: 'red',
        icon: <ExclamationCircleOutlined />,
        text: 'Error'
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] ||
      { color: 'default', icon: <ClockCircleOutlined />, text: status };

    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  const columns = [
    {
      title: 'Cluster',
      key: 'cluster',
      render: (_: any, record: ClusterInfo) => (
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-medium">{record.name}</span>
            {getClusterTypeTag(record.type)}
          </div>
          {record.kubeVersion && (
            <div className="text-gray-500 text-sm">
              Kubernetes {record.kubeVersion}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusBadge(status),
    },
    {
      title: 'Nodes',
      dataIndex: 'nodeCount',
      key: 'nodeCount',
      render: (count: number) => count || '-',
    },
    {
      title: 'Migration Controller',
      key: 'migrationController',
      render: (_: any, record: ClusterInfo) => (
        <div>
          {getControllerStatusTag(record.migrationControllerStatus, record.migrationControllerVersion)}
          {record.error && (
            <Tooltip title={record.error}>
              <InfoCircleOutlined className="text-red-500 ml-2" />
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'Last Checked',
      dataIndex: 'lastChecked',
      key: 'lastChecked',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ClusterInfo) => (
        <Space>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => handleCheckStatus(record.name)}
            loading={checkStatusMutation.isPending}
            size="small"
          >
            Refresh
          </Button>

          {record.migrationControllerStatus === 'not-installed' ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handleInstall(record.name)}
              loading={installMutation.isPending}
              size="small"
            >
              Install
            </Button>
          ) : record.migrationControllerStatus === 'installed' ? (
            <>
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => handleViewLogs(record.name)}
                size="small"
              >
                Logs
              </Button>
              <Popconfirm
                title="Uninstall Migration Controller"
                description="Are you sure you want to uninstall the migration controller?"
                onConfirm={() => handleUninstall(record.name)}
                okText="Yes"
                cancelText="No"
              >
                <Button
                  danger
                  icon={<StopOutlined />}
                  loading={uninstallMutation.isPending}
                  size="small"
                >
                  Uninstall
                </Button>
              </Popconfirm>
            </>
          ) : (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handleInstall(record.name)}
              loading={installMutation.isPending}
              size="small"
            >
              Retry Install
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const installedCount = clusters?.clusters?.filter(
    (cluster: ClusterInfo) => cluster.migrationControllerStatus === 'installed'
  ).length || 0;

  const totalCount = clusters?.clusters?.length || 0;

  return (
    <Panel showSelectCluster={false}>
      <div className="mb-6">
        <Alert
          message={
            <div className="flex items-center justify-between">
              <span>
                Migration Controller Status: {installedCount} of {totalCount} clusters have controllers installed
              </span>
              <div className="flex items-center space-x-4 text-sm">
                <span>
                  <Badge status="success" /> Installed: {installedCount}
                </span>
                <span>
                  <Badge status="error" /> Not Installed: {totalCount - installedCount}
                </span>
              </div>
            </div>
          }
          type={installedCount === totalCount ? 'success' : 'warning'}
          showIcon
        />
      </div>
      <Card>
        <Table
          columns={columns}
          dataSource={clusters?.clusters || []}
          rowKey="name"
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} clusters`,
          }}
        />
      </Card>
      <Modal
        title={`Migration Controller Logs - ${selectedCluster}`}
        open={logsModalVisible}
        onCancel={() => {
          setLogsModalVisible(false);
          setSelectedCluster('');
        }}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setLogsModalVisible(false);
              setSelectedCluster('');
            }}
          >
            Close
          </Button>
        ]}
        width={1000}
        className="logs-modal"
      >
        <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm max-h-96 overflow-y-auto">
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spin size="large" />
            </div>
          ) : logs?.length ? (
            logs.map((line: string, index: number) => (
              <div key={index} className="mb-1">
                {line}
              </div>
            ))
          ) : (
            <div className="text-gray-500">No logs available</div>
          )}
        </div>
      </Modal>
      <Card className="mt-6" title="Migration Controller Information">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Components</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li><strong>Management Cluster:</strong> MigrationBackup Controller - Manages backup operations and CR lifecycle</li>
              <li><strong>Member Clusters:</strong> CheckpointBackup Controller (DaemonSet) - Performs container checkpointing</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium mb-2">Prerequisites</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>Kubernetes 1.20+ with checkpoint API enabled</li>
              <li>Buildah and container tools available on worker nodes</li>
              <li>Container registry access for backup storage</li>
              <li>Proper RBAC permissions for checkpoint operations</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium mb-2">Version Information</h4>
            <p className="text-sm text-gray-600">
              Current recommended version: <strong>v2.0</strong> - Includes latest features and bug fixes
            </p>
          </div>
        </div>
      </Card>
    </Panel>
  );
};

export default SettingsPage;



