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
  Select,
  message,
  Popconfirm,
  Card,
  Typography,
  Empty,
  Row,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GetPriorities,
  SetPriority,
  UpdatePriority,
  DeletePriority,
  type PriorityAssignment,
  type PriorityAssignmentRequest,
} from '@/services/priority';
import { GetUsers, type User } from '@/services/users';
import Panel from '@/components/panel';

const { Title, Paragraph } = Typography;

const PRIORITY_OPTIONS = [
    { value: 'high-priority-training', label: 'High', color: 'red' },
    { value: 'standard-priority-training', label: 'Standard', color: 'blue' },
    { value: 'low-priority-training', label: 'Low', color: 'default' },
];

const PriorityAnnotationCard = () => {
  return (
    <Card size="small">
        <Typography.Text type="secondary">
            <strong>Priority Levels:</strong>
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
            <li><Tag color="default">Low</Tag> - Standard workloads, lowest priority</li>
            <li><Tag color="blue">Standard</Tag> - Normal workloads, medium priority</li>
            <li><Tag color="red">High</Tag> - Critical workloads, highest priority</li>
            </ul>
        </Typography.Text>
    </Card>
  );
};

const PriorityManagement = () => {
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<PriorityAssignment | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const queryClient = useQueryClient();

  // Fetch priority assignments
  const { data: prioritiesData, isLoading } = useQuery({
    queryKey: ['priorities'],
    queryFn: async () => {
      const response = await GetPriorities();
      return response.data;
    },
  });

  // Fetch users/profiles
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await GetUsers();
      return response.data;
    },
  });

  // Create priority assignment mutation
  const createMutation = useMutation({
    mutationFn: (values: PriorityAssignmentRequest) => SetPriority(values),
    onSuccess: () => {
      message.success('Priority assignment created successfully');
      setIsCreateModalVisible(false);
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['priorities'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to create priority assignment');
    },
  });

  // Update priority assignment mutation
  const updateMutation = useMutation({
    mutationFn: ({ profile, priorityClass }: { profile: string; priorityClass: string }) =>
      UpdatePriority(profile, priorityClass),
    onSuccess: () => {
      message.success('Priority assignment updated successfully');
      setIsEditModalVisible(false);
      editForm.resetFields();
      setSelectedAssignment(null);
      queryClient.invalidateQueries({ queryKey: ['priorities'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to update priority assignment');
    },
  });

  // Delete priority assignment mutation
  const deleteMutation = useMutation({
    mutationFn: (profile: string) => DeletePriority(profile),
    onSuccess: () => {
      message.success('Priority assignment deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['priorities'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to delete priority assignment');
    },
  });

  const handleCreateAssignment = () => {
    createForm.validateFields().then((values) => {
      createMutation.mutate(values);
    });
  };

  const handleEditAssignment = () => {
    editForm.validateFields().then((values) => {
      if (selectedAssignment) {
        updateMutation.mutate({
          profile: selectedAssignment.profile,
          priorityClass: values.priorityClass,
        });
      }
    });
  };

  const handleEdit = (assignment: PriorityAssignment) => {
    setSelectedAssignment(assignment);
    editForm.setFieldsValue({
      priorityClass: assignment.priorityClass,
    });
    setIsEditModalVisible(true);
  };

  const handleDelete = (profile: string) => {
    deleteMutation.mutate(profile);
  };

  const getPriorityLabel = (priorityClass: string) => {
    const option = PRIORITY_OPTIONS.find((opt) => opt.value === priorityClass);
    return option ? option.label : priorityClass;
  };

  const getPriorityColor = (priorityClass: string) => {
    const option = PRIORITY_OPTIONS.find((opt) => opt.value === priorityClass);
    return option ? option.color : 'default';
  };

  // Get list of profiles that don't have priority assignments yet
  const getAvailableProfiles = () => {
    if (!usersData) return [];
    
    const assignedProfiles = new Set(
      prioritiesData?.data?.assignments?.map((a: PriorityAssignment) => a.profile) || []
    );
    
    return usersData
      .filter((user: User) => user.profile) // Only include users with profiles
      .map((user: User) => ({
        value: user.profile,
        label: `${user.username} (${user.email})`,
        email: user.email,
      }))
      .filter((profile: { value: string; label: string; email: string }) => 
        !assignedProfiles.has(profile.value)
      );
  };

  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      width: 150,
      render: (username: string) => username || '-',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 220,
      render: (email: string) => email || '-',
    },
    {
      title: 'Priority',
      dataIndex: 'priorityClass',
      key: 'priorityClass',
      width: 150,
      render: (priorityClass: string) => (
        <Tag color={getPriorityColor(priorityClass)} style={{ fontSize: '14px', padding: '4px 12px' }}>
          {getPriorityLabel(priorityClass)}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: PriorityAssignment) => (
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
            title="Delete Priority Assignment"
            description={`Are you sure you want to delete the priority assignment for "${record.profile}"?`}
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
    },
  ];

  return (
    <Panel>
      <Card>
        <Row justify="space-between" align="middle">
            <div style={{ marginBottom: 24 }}>
            <Title level={3}>Priority Management</Title>
            <Paragraph type="secondary">
                Manage training workload priorities for user profiles (Kubeflow namespaces). 
                Default priority for profiles without assignment is <Tag color="default">Low</Tag>.
            </Paragraph>
            </div>

            <div style={{ marginBottom: 16 }}>
            <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setIsCreateModalVisible(true)}
            >
                Assign Priority
            </Button>
            </div>
        </Row>

        <Table
          columns={columns}
          dataSource={prioritiesData?.data?.assignments || []}
          rowKey="profile"
          loading={isLoading}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} assignments`,
            defaultPageSize: 10,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 600 }}
          locale={{
            emptyText: (
              <Empty
                description="No priority assignments yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalVisible(true)}>
                  Create First Assignment
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      {/* Create Priority Assignment Modal */}
      <Modal
        title="Assign Priority to Profile"
        open={isCreateModalVisible}
        onOk={handleCreateAssignment}
        onCancel={() => {
          setIsCreateModalVisible(false);
          createForm.resetFields();
        }}
        confirmLoading={createMutation.isPending}
        width={600}
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{
            priorityClass: 'standard-priority-training',
          }}
        >
          <Form.Item
            label="Profile"
            name="profile"
            rules={[{ required: true, message: 'Please select a profile' }]}
            extra="Select a user profile (Kubeflow namespace) to assign priority"
          >
            <Select
              showSearch
              placeholder="Select a profile"
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={getAvailableProfiles()}
              notFoundContent={
                getAvailableProfiles().length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="All profiles have been assigned priorities"
                  />
                ) : null
              }
            />
          </Form.Item>

          <Form.Item
            label="Priority"
            name="priorityClass"
            rules={[{ required: true, message: 'Please select a priority' }]}
          >
            <Select>
              {PRIORITY_OPTIONS.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  <Tag color={option.color}>{option.label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <PriorityAnnotationCard />
        </Form>
      </Modal>

      {/* Edit Priority Assignment Modal */}
      <Modal
        title={`Edit Priority for "${selectedAssignment?.profile}"`}
        open={isEditModalVisible}
        onOk={handleEditAssignment}
        onCancel={() => {
          setIsEditModalVisible(false);
          editForm.resetFields();
          setSelectedAssignment(null);
        }}
        confirmLoading={updateMutation.isPending}
        width={600}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="Priority"
            name="priorityClass"
            rules={[{ required: true, message: 'Please select a priority' }]}
          >
            <Select>
              {PRIORITY_OPTIONS.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  <Tag color={option.color}>{option.label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <PriorityAnnotationCard />
        </Form>
      </Modal>
    </Panel>
  );
};

export default PriorityManagement;

