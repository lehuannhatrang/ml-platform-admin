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

import Panel from '@/components/panel';
import { useQuery } from '@tanstack/react-query';
import {
  GetCloudCredentials,
  DeleteCloudCredential,
  CloudCredential,
} from '@/services/cloudcredentials';
import {
  Tag,
  Table,
  TableColumnProps,
  Space,
  Button,
  message,
  Popconfirm,
} from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import NewCredentialModal from './new-credential-modal';

const getProviderColor = (provider: string): string => {
  const colors: Record<string, string> = {
    aws: 'orange',
    gcp: 'blue',
    azure: 'cyan',
    openstack: 'red',
    vsphere: 'green',
  };
  return colors[provider?.toLowerCase()] || 'default';
};

const CloudCredentialsPage = () => {
  const [messageApi, messageContextHolder] = message.useMessage();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['GetCloudCredentials'],
    queryFn: async () => {
      const ret = await GetCloudCredentials();
      return ret.data;
    },
  });

  const [credentialModalData, setCredentialModalData] = useState<{
    mode: 'create' | 'edit';
    open: boolean;
    credential?: CloudCredential;
  }>({
    mode: 'create',
    open: false,
  });

  const handleDelete = async (name: string) => {
    try {
      const ret = await DeleteCloudCredential(name);
      if (ret.code === 200) {
        messageApi.success('Cloud credential deleted successfully');
        refetch();
      } else {
        messageApi.error(ret.message || 'Failed to delete cloud credential');
      }
    } catch (error) {
      messageApi.error('Failed to delete cloud credential');
      console.error('Delete error:', error);
    }
  };

  const columns: TableColumnProps<CloudCredential>[] = [
    {
      title: 'Credential Name',
      key: 'name',
      dataIndex: 'name',
      width: 200,
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Cloud Provider',
      key: 'provider',
      dataIndex: 'provider',
      width: 150,
      render: (provider: string) => (
        <Tag color={getProviderColor(provider)}>
          {provider?.toUpperCase() || 'UNKNOWN'}
        </Tag>
      ),
      filters: [
        { text: 'AWS', value: 'aws' },
        { text: 'GCP', value: 'gcp' },
        { text: 'Azure', value: 'azure' },
        { text: 'OpenStack', value: 'openstack' },
        { text: 'vSphere', value: 'vsphere' },
      ],
      onFilter: (value, record) => record.provider === value,
    },
    {
      title: 'Description',
      key: 'description',
      dataIndex: 'description',
      ellipsis: true,
      render: (desc: string) => desc || '-',
    },
    {
      title: 'Created At',
      key: 'createdAt',
      dataIndex: 'createdAt',
      width: 180,
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      title: 'Action',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setCredentialModalData({
                mode: 'edit',
                open: true,
                credential: record,
              });
            }}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete Cloud Credential"
            description="Are you sure you want to delete this credential?"
            onConfirm={() => handleDelete(record.name)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {messageContextHolder}
      <Panel>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h2>Cloud Credentials</h2>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCredentialModalData({
                mode: 'create',
                open: true,
              });
            }}
          >
            Add Credential
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={data?.credentials || []}
          loading={isLoading}
          rowKey="name"
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} credentials`,
            defaultPageSize: 10,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
        />
      </Panel>
      <NewCredentialModal
        mode={credentialModalData.mode}
        open={credentialModalData.open}
        credential={credentialModalData.credential}
        onOk={(ret) => {
          if (ret.code === 200) {
            messageApi.success(
              credentialModalData.mode === 'create'
                ? 'Cloud credential created successfully'
                : 'Cloud credential updated successfully'
            );
            refetch();
            setCredentialModalData({ mode: 'create', open: false });
          } else {
            messageApi.error(ret.message || 'Operation failed');
          }
        }}
        onCancel={() => {
          setCredentialModalData({ mode: 'create', open: false });
        }}
      />
    </div>
  );
};

export default CloudCredentialsPage;




