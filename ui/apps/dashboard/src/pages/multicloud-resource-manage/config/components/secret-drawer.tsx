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
import { Drawer, Space, Descriptions, Button, Tabs, Table, Typography, Empty } from 'antd';
import { ColumnsType } from 'antd/es/table';
import i18nInstance from '@/utils/i18n';
import { calculateDuration } from '@/utils/time';
import TagList, { convertLabelToTags } from '@/components/tag-list';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';

interface SecretDrawerProps {
  open: boolean;
  onClose: () => void;
  secret: any;
  clusterName: string;
}

const SecretDrawer: React.FC<SecretDrawerProps> = ({ open, onClose, secret, clusterName }) => {
  const [showDecodedData, setShowDecodedData] = useState<{ [key: string]: boolean }>({});

  // Function to decode base64 data
  const decodeBase64 = (str: string): string => {
    try {
      return atob(str);
    } catch (e) {
      return 'Invalid base64 string';
    }
  };

  // Toggle visibility of decoded data
  const toggleDecoded = (key: string) => {
    setShowDecodedData((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Format the secret data for display
  const getSecretDataColumns = (): ColumnsType<any> => [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      width: '30%',
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: '60%',
      render: (_, record) => {
        const isVisible = showDecodedData[record.key] || false;
        
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text
              copyable={!!record.value}
              style={{
                wordBreak: 'break-all',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
              }}
            >
              {(isVisible 
                ? decodeBase64(record.value)
                : record.value
              ) || '-'}
            </Typography.Text>
            {!!record.value && <Button
              type="text"
              size="small"
              icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => toggleDecoded(record.key)}
            >
            </Button>}
          </Space>
        );
      },
    },
  ];

  // Transform secret data object to array for table display
  const getSecretDataSource = () => {
    if (!secret?.data) return [];
    
    return Object.entries(secret.data).map(([key, value]) => ({
      key,
      value,
    }));
  };

  const tabItems = [
    {
      key: 'data',
      label: 'Secret Data',
      children: secret?.data ? (
        <Table
          columns={getSecretDataColumns()}
          dataSource={getSecretDataSource()}
          pagination={false}
          rowKey="key"
        />
      ) : (
        <Empty description='No secret data available' />
      ),
    },
    {
      key: 'yaml',
      label: 'YAML',
      children: (
        <pre
          style={{
            backgroundColor: '#f5f5f5',
            padding: '16px',
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '500px',
          }}
        >
          {secret ? JSON.stringify(secret, null, 2) : ''}
        </pre>
      ),
    },
  ];

  return (
    <Drawer
      title={`Secret: ${secret?.metadata?.name || ''}`}
      placement="right"
      width={800}
      onClose={onClose}
      open={open}
    >
      {secret ? (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Descriptions title='Information' bordered column={2}>
            <Descriptions.Item label={i18nInstance.t('d1d64de5ff73bc8b408035fcdb2cc77c', 'Secret Name')} span={2}>
              {secret.metadata?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={i18nInstance.t('a4b28a416f0b6f3c215c51e79e517298', 'Namespace')} span={2}>
              {secret.metadata?.namespace || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Cluster" span={2}>
              {clusterName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Type" span={2}>
              {secret.type || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Age" span={2}>
              {calculateDuration(secret.metadata?.creationTimestamp) || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={i18nInstance.t('1f7be0a924280cd098db93c9d81ecccd', 'Labels')} span={2}>
              <TagList tags={convertLabelToTags(secret.metadata?.name || '', secret.metadata?.labels)} />
            </Descriptions.Item>
            <Descriptions.Item label={i18nInstance.t('0885b74b8b50e639e827d5fa3cd608e5', 'Annotations')} span={2}>
              <TagList tags={convertLabelToTags('', secret.metadata?.annotations)} />
            </Descriptions.Item>
          </Descriptions>

          <Tabs defaultActiveKey="data" items={tabItems} />
        </Space>
      ) : (
        <Empty description={i18nInstance.t('3cde899949727670f0b361e78f70bab5', 'Secret information not available')} />
      )}
    </Drawer>
  );
};

export default SecretDrawer;