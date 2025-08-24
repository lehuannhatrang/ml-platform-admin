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
  Button,
  Card,
  Space,
  Table,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Tag,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getBackups,
  createBackup,
  updateBackup,
  deleteBackup,
  getRegistries,
  getClusters,
  getResourcesInCluster,
  type BackupConfiguration,
  type CreateBackupRequest,
  type UpdateBackupRequest
} from '@/services/backup-recovery';
import { GetNamespaces } from '@/services/namespace';
import { DataSelectQuery } from '@/services/base';
import CronInput from '@/components/CronInput';
import Panel from '@/components/panel';

const { Option } = Select;

const BackupPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingBackup, setEditingBackup] = useState<BackupConfiguration | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  // Form state
  const [selectedCluster, setSelectedCluster] = useState<string>('');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');
  const [selectedResourceType, setSelectedResourceType] = useState<string>('');
  const [scheduleType, setScheduleType] = useState<'selection' | 'cron'>('selection');

  // Fetch data
  const { data: backups, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: getBackups,
  });

  const { data: registries } = useQuery({
    queryKey: ['registries'],
    queryFn: getRegistries,
  });

  const { data: clusters } = useQuery({
    queryKey: ['clusters'],
    queryFn: getClusters,
  });

  const { data: namespaces } = useQuery({
    queryKey: ['namespaces', selectedCluster],
    queryFn: () => {
      const query: DataSelectQuery = {};
      const cluster = { label: selectedCluster, value: selectedCluster };
      return GetNamespaces(query, cluster);
    },
    enabled: !!selectedCluster,
  });

  const { data: resources } = useQuery({
    queryKey: ['resources', selectedCluster, selectedResourceType, selectedNamespace],
    queryFn: () => getResourcesInCluster(selectedCluster, selectedResourceType, selectedNamespace),
    enabled: !!(selectedCluster && selectedResourceType && selectedNamespace),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setIsModalVisible(false);
      form.resetFields();
      message.success('Backup configuration created successfully');
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to create backup configuration');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBackupRequest }) =>
      updateBackup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setIsModalVisible(false);
      form.resetFields();
      setEditingBackup(null);
      message.success('Backup configuration updated successfully');
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to update backup configuration');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      message.success('Backup configuration deleted successfully');
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to delete backup configuration');
    },
  });


  const handleCreate = () => {
    setEditingBackup(null);
    form.resetFields();
    setSelectedCluster('');
    setSelectedNamespace('');
    setSelectedResourceType('');
    setScheduleType('selection');
    setIsModalVisible(true);
  };

  const handleEdit = (backup: BackupConfiguration) => {
    setEditingBackup(backup);
    setSelectedCluster(backup.cluster);
    setSelectedNamespace(backup.namespace);
    setSelectedResourceType(backup.resourceType);
    setScheduleType(backup.schedule.type as 'selection' | 'cron');

    form.setFieldsValue({
      name: backup.name,
      cluster: backup.cluster,
      resourceType: backup.resourceType,
      resourceName: backup.resourceName,
      namespace: backup.namespace,
      registryId: backup.registry.id,
      repository: backup.repository,
      scheduleType: backup.schedule.type,
      scheduleValue: backup.schedule.value,
      scheduleEnabled: backup.schedule.enabled,
    });
    setIsModalVisible(true);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };


  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const requestData: CreateBackupRequest = {
        name: values.name,
        cluster: values.cluster,
        resourceType: values.resourceType,
        resourceName: values.resourceName,
        namespace: values.namespace,
        registryId: values.registryId,
        repository: values.repository,
        schedule: {
          type: scheduleType,
          value: values.scheduleValue,
          enabled: values.scheduleEnabled ?? true,
        },
      };

      if (editingBackup) {
        updateMutation.mutate({
          id: editingBackup.id,
          data: requestData,
        });
      } else {
        createMutation.mutate(requestData);
      }
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig = {
      Active: { color: 'green', text: 'Active' },
      Paused: { color: 'orange', text: 'Paused' },
      Error: { color: 'red', text: 'Error' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] ||
      { color: 'default', text: status };

    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const getScheduleDisplay = (schedule: any) => {
    if (schedule.type === 'selection') {
      const scheduleMap = {
        '5m': 'Every 5 minutes',
        '15m': 'Every 15 minutes',
        '30m': 'Every 30 minutes',
        '1h': 'Every hour',
      };
      return scheduleMap[schedule.value as keyof typeof scheduleMap] || schedule.value;
    }
    return `Cron: ${schedule.value}`;
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: BackupConfiguration) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-gray-500 text-sm">
            {record.resourceType}: {record.resourceName}
          </div>
        </div>
      ),
    },
    {
      title: 'Cluster',
      dataIndex: 'cluster',
      key: 'cluster',
    },
    {
      title: 'Namespace',
      dataIndex: 'namespace',
      key: 'namespace',
    },
    {
      title: 'Repository',
      key: 'registry',
      render: (_: any, record: BackupConfiguration) => (
        <div>
          <div className="font-medium">{record.registry.name}</div>
          <div className="text-gray-500 text-sm">{record.repository}</div>
        </div>
      ),
    },
    {
      title: 'Schedule',
      key: 'schedule',
      render: (_: any, record: BackupConfiguration) => (
        <div className="flex items-center space-x-2">
          <ClockCircleOutlined />
          <span>{getScheduleDisplay(record.schedule)}</span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Last Backup',
      dataIndex: 'lastBackup',
      key: 'lastBackup',
      render: (text: string) => text ? new Date(text).toLocaleString() : 'Never',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: BackupConfiguration) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete Backup Configuration"
            description="Are you sure you want to delete this backup configuration?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel showSelectCluster={false}>
      <div className="flex justify-between mb-4">
        <Typography.Title level={3}>Backup Configuration</Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreate}
        >
          Create Backup
        </Button>
      </div>
      <Card>
        <Table
          columns={columns}
          dataSource={backups?.backups || []}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} backup configurations`,
          }}
        />
      </Card>

      <Modal
        title={editingBackup ? 'Edit Backup Configuration' : 'Create Backup Configuration'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
          setEditingBackup(null);
          setSelectedCluster('');
          setSelectedNamespace('');
          setSelectedResourceType('');
        }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Backup Name"
            rules={[
              { required: true, message: 'Please enter backup name' },
              { max: 50, message: 'Name must be less than 50 characters' },
            ]}
          >
            <Input placeholder="e.g., mysql-daily-backup" />
          </Form.Item>

          <Form.Item
            name="cluster"
            label="Target Cluster"
            rules={[{ required: true, message: 'Please select a cluster' }]}
          >
            <Select
              placeholder="Select cluster"
              onChange={(value) => {
                setSelectedCluster(value);
                // Clear downstream fields when cluster changes
                setSelectedNamespace('');
                setSelectedResourceType('');
                form.setFieldsValue({
                  namespace: undefined,
                  resourceType: undefined,
                  resourceName: undefined,
                });
              }}
              loading={!clusters}
            >
              {clusters?.clusters?.map((cluster: any) => (
                <Option key={cluster.name} value={cluster.name}>
                  {cluster.name} ({cluster.type})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="resourceType"
              label="Resource Type"
              rules={[{ required: true, message: 'Please select resource type' }]}
            >
              <Select
                placeholder="Select type"
                onChange={(value) => {
                  setSelectedResourceType(value);
                  // Clear resource name when resource type changes
                  form.setFieldsValue({
                    resourceName: undefined,
                  });
                }}
                disabled={!selectedCluster}
              >
                <Option value="pod">Pod</Option>
                <Option value="statefulset">StatefulSet</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="namespace"
              label="Namespace"
              rules={[{ required: true, message: 'Please select namespace' }]}
            >
              <Select
                placeholder="Select namespace"
                onChange={(value) => {
                  setSelectedNamespace(value);
                  // Clear resource name when namespace changes
                  form.setFieldsValue({
                    resourceName: undefined,
                  });
                }}
                disabled={!selectedCluster}
                loading={!namespaces && !!selectedCluster}
              >
                {namespaces?.data?.namespaces?.map((namespace: any) => (
                  <Option key={namespace.objectMeta.name} value={namespace.objectMeta.name}>
                    {namespace.objectMeta.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            name="resourceName"
            label="Resource Name"
            rules={[{ required: true, message: 'Please select resource' }]}
          >
            <Select
              placeholder="Select resource"
              loading={!resources && !!selectedCluster && !!selectedResourceType && !!selectedNamespace}
              disabled={!selectedCluster || !selectedResourceType || !selectedNamespace}
            >
              {resources?.resources?.map((resource: any) => (
                <Option key={resource.name} value={resource.name}>
                  {resource.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="registryId"
              label="Registry"
              rules={[{ required: true, message: 'Please select a registry' }]}
            >
              <Select placeholder="Select registry">
                {registries?.registries?.map((registry: any) => (
                  <Option key={registry.id} value={registry.id}>
                    {registry.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="repository"
              label="Repository"
              rules={[{ required: true, message: 'Please enter repository name' }]}
            >
              <Input placeholder="e.g., my-app/backups" />
            </Form.Item>
          </div>

          <Form.Item label="Backup Schedule">
            <div className="space-y-4">
              <Form.Item
                name="scheduleType"
                className="mb-2"
              >
                <Select
                  value={scheduleType}
                  onChange={(value) => setScheduleType(value)}
                >
                  <Option value="selection">Quick Selection</Option>
                  <Option value="cron">Custom Cron</Option>
                </Select>
              </Form.Item>

              {scheduleType === 'selection' ? (
                <Form.Item
                  name="scheduleValue"
                  rules={[{ required: true, message: 'Please select schedule interval' }]}
                >
                  <Select placeholder="Select interval">
                    <Option value="5m">Every 5 minutes</Option>
                    <Option value="15m">Every 15 minutes</Option>
                    <Option value="30m">Every 30 minutes</Option>
                    <Option value="1h">Every hour</Option>
                  </Select>
                </Form.Item>
              ) : (
                <Form.Item
                  name="scheduleValue"
                  rules={[
                    { required: true, message: 'Please enter cron expression' },
                    {
                      pattern: /^[\d\*\-\/\,\s]+\s+[\d\*\-\/\,\s]+\s+[\d\*\-\/\,\s]+\s+[\d\*\-\/\,\s]+\s+[\d\*\-\/\,\s]+$/,
                      message: 'Please enter a valid cron expression (5 fields)',
                    },
                  ]}
                >
                  <CronInput placeholder="e.g., 0 2 * * * (daily at 2 AM)" />
                </Form.Item>
              )}
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </Panel>

  );
};

export default BackupPage;



