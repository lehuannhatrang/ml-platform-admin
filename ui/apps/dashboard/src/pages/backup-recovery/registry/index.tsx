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
import { Button, Card, Space, Table, Modal, Form, Input, message, Popconfirm, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRegistries,
  createRegistry,
  updateRegistry,
  deleteRegistry,
  type RegistryCredentials,
  type UpdateRegistryRequest
} from '@/services/backup-recovery';
import Panel from '@/components/panel';

const RegistryPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRegistry, setEditingRegistry] = useState<RegistryCredentials | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  // Fetch registries
  const { data: registries, isLoading } = useQuery({
    queryKey: ['registries'],
    queryFn: getRegistries,
  });

  // Create registry mutation
  const createMutation = useMutation({
    mutationFn: createRegistry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registries'] });
      setIsModalVisible(false);
      form.resetFields();
      message.success('Registry created successfully');
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to create registry');
    },
  });

  // Update registry mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRegistryRequest }) =>
      updateRegistry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registries'] });
      setIsModalVisible(false);
      form.resetFields();
      setEditingRegistry(null);
      message.success('Registry updated successfully');
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to update registry');
    },
  });

  // Delete registry mutation
  const deleteMutation = useMutation({
    mutationFn: deleteRegistry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registries'] });
      message.success('Registry deleted successfully');
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to delete registry');
    },
  });

  const handleCreate = () => {
    setEditingRegistry(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (registry: RegistryCredentials) => {
    setEditingRegistry(registry);
    form.setFieldsValue({
      name: registry.name,
      registry: registry.registry,
      username: registry.username,
      description: registry.description,
    });
    setIsModalVisible(true);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingRegistry) {
        // Update existing registry
        updateMutation.mutate({
          id: editingRegistry.id,
          data: values,
        });
      } else {
        // Create new registry
        createMutation.mutate(values);
      }
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: RegistryCredentials) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-gray-500 text-sm">{record.registry}</div>
        </div>
      ),
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: RegistryCredentials) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete Registry"
            description="Are you sure you want to delete this registry?"
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
      <div className="mb-6">
        <div className="flex justify-between">
          <Typography.Title level={3}>Registry Management</Typography.Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            Add Registry
          </Button>
        </div>
      </div>
      <Card>
        <Table
          columns={columns}
          dataSource={registries?.registries || []}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} registries`,
          }}
        />
      </Card>

      <Modal
        title={editingRegistry ? 'Edit Registry' : 'Add Registry'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
          setEditingRegistry(null);
        }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Registry Name"
            rules={[
              { required: true, message: 'Please enter registry name' },
              { max: 50, message: 'Name must be less than 50 characters' },
            ]}
          >
            <Input placeholder="e.g., Docker Hub, AWS ECR" />
          </Form.Item>

          <Form.Item
            name="registry"
            label="Registry URL"
            rules={[
              { required: true, message: 'Please enter registry URL' },
              { type: 'url', message: 'Please enter a valid URL' },
            ]}
          >
            <Input placeholder="e.g., https://index.docker.io/v1/" />
          </Form.Item>

          <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: 'Please enter username' },
            ]}
          >
            <Input placeholder="Registry username" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: !editingRegistry, message: 'Please enter password' },
            ]}
          >
            <Input.Password placeholder="Registry password or access token" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea
              placeholder="Optional description for this registry"
              rows={3}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
};

export default RegistryPage;



