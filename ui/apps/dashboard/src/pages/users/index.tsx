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

import {
  Button,
  Table,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Switch,
  Select,
  message,
  Popconfirm,
  Card,
  Typography,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GetUsers,
  CreateUser,
  UpdateUser,
  DeleteUser,
  UpdateUserPassword,
  GetRoles,
  type User,
  type CreateUserRequest,
  type UpdateUserRequest,
} from '@/services/users';
import Panel from '@/components/panel';
import dayjs from 'dayjs';

const { Title } = Typography;

const UsersManagement = () => {
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const queryClient = useQueryClient();

  // Fetch users
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await GetUsers();
      return response.data;
    },
  });

  // Fetch roles
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const response = await GetRoles();
      return response.data;
    },
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: (values: CreateUserRequest) => CreateUser(values),
    onSuccess: () => {
      message.success('User created successfully');
      setIsCreateModalVisible(false);
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to create user');
    },
  });

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateUserRequest }) =>
      UpdateUser(id, values),
    onSuccess: () => {
      message.success('User updated successfully');
      setIsEditModalVisible(false);
      editForm.resetFields();
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to update user');
    },
  });

  // Update password mutation
  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      UpdateUserPassword(id, { password }),
    onSuccess: () => {
      message.success('Password updated successfully');
      setIsPasswordModalVisible(false);
      passwordForm.resetFields();
      setSelectedUser(null);
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to update password');
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => DeleteUser(id),
    onSuccess: () => {
      message.success('User deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to delete user');
    },
  });

  const handleCreateUser = () => {
    createForm.validateFields().then((values) => {
      createMutation.mutate(values);
    });
  };

  const handleEditUser = () => {
    editForm.validateFields().then((values) => {
      if (selectedUser) {
        updateMutation.mutate({ id: selectedUser.id, values });
      }
    });
  };

  const handleUpdatePassword = () => {
    passwordForm.validateFields().then((values) => {
      if (selectedUser) {
        passwordMutation.mutate({ id: selectedUser.id, password: values.password });
      }
    });
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    editForm.setFieldsValue({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled,
      emailVerified: user.emailVerified,
      roles: user.roles,
    });
    setIsEditModalVisible(true);
  };

  const handleChangePassword = (user: User) => {
    setSelectedUser(user);
    setIsPasswordModalVisible(true);
  };

  const handleDelete = (userId: string) => {
    deleteMutation.mutate(userId);
  };

  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      fixed: 'left' as const,
      width: 150,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Email Verified',
      dataIndex: 'emailVerified',
      key: 'emailVerified',
      width: 120,
      render: (verified: boolean) => (
        <Tag color={verified ? 'blue' : 'default'}>
          {verified ? 'Verified' : 'Not Verified'}
        </Tag>
      ),
    },
    {
      title: 'Roles',
      dataIndex: 'roles',
      key: 'roles',
      width: 200,
      render: (roles: string[]) => (
        <>
          {roles.map((role) => (
            <Tag key={role} color="purple">
              {role}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'createdTimestamp',
      key: 'createdTimestamp',
      width: 180,
      render: (timestamp: number) =>
        timestamp ? dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: any, record: User) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            size="small"
          >
            
          </Button>
          <Button
            type="link"
            icon={<KeyOutlined />}
            onClick={() => handleChangePassword(record)}
            size="small"
          >
            
          </Button>
          <Popconfirm
            title="Delete User"
            description={`Are you sure you want to delete user "${record.username}"?`}
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel showSelectCluster={false}>
      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>Users Management</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateModalVisible(true)}
          >
            Create User
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={usersData}
          rowKey="id"
          loading={isLoading}
          scroll={{ x: 1400 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} users`,
          }}
        />
      </Card>

      {/* Create User Modal */}
      <Modal
        title="Create New User"
        open={isCreateModalVisible}
        onOk={handleCreateUser}
        onCancel={() => {
          setIsCreateModalVisible(false);
          createForm.resetFields();
        }}
        width={600}
        confirmLoading={createMutation.isPending}
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{ enabled: true, emailVerified: false }}
        >
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Please input username!' }]}
          >
            <Input placeholder="Enter username" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Please input email!' },
              { type: 'email', message: 'Please enter a valid email!' },
            ]}
          >
            <Input placeholder="Enter email" />
          </Form.Item>

          <Form.Item label="First Name" name="firstName">
            <Input placeholder="Enter first name" />
          </Form.Item>

          <Form.Item label="Last Name" name="lastName">
            <Input placeholder="Enter last name" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: 'Please input password!' },
              { min: 8, message: 'Password must be at least 8 characters!' },
            ]}
          >
            <Input.Password placeholder="Enter password" />
          </Form.Item>

          <Form.Item label="Roles" name="roles">
            <Select
              mode="multiple"
              placeholder="Select roles"
              options={rolesData?.map((role) => ({ label: role, value: role }))}
            />
          </Form.Item>

          <Form.Item label="Enabled" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Email Verified" name="emailVerified" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        title={`Edit User: ${selectedUser?.username}`}
        open={isEditModalVisible}
        onOk={handleEditUser}
        onCancel={() => {
          setIsEditModalVisible(false);
          editForm.resetFields();
          setSelectedUser(null);
        }}
        width={600}
        confirmLoading={updateMutation.isPending}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="Email"
            name="email"
            rules={[{ type: 'email', message: 'Please enter a valid email!' }]}
          >
            <Input placeholder="Enter email" />
          </Form.Item>

          <Form.Item label="First Name" name="firstName">
            <Input placeholder="Enter first name" />
          </Form.Item>

          <Form.Item label="Last Name" name="lastName">
            <Input placeholder="Enter last name" />
          </Form.Item>

          <Form.Item label="Roles" name="roles">
            <Select
              mode="multiple"
              placeholder="Select roles"
              options={rolesData?.map((role) => ({ label: role, value: role }))}
            />
          </Form.Item>

          <Form.Item label="Enabled" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Email Verified" name="emailVerified" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title={`Change Password: ${selectedUser?.username}`}
        open={isPasswordModalVisible}
        onOk={handleUpdatePassword}
        onCancel={() => {
          setIsPasswordModalVisible(false);
          passwordForm.resetFields();
          setSelectedUser(null);
        }}
        width={500}
        confirmLoading={passwordMutation.isPending}
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            label="New Password"
            name="password"
            rules={[
              { required: true, message: 'Please input new password!' },
              { min: 8, message: 'Password must be at least 8 characters!' },
            ]}
          >
            <Input.Password placeholder="Enter new password" />
          </Form.Item>

          <Form.Item
            label="Confirm Password"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm password!' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Passwords do not match!'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="Confirm new password" />
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
};

export default UsersManagement;


