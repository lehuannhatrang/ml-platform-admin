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

import { useState, useEffect } from 'react';
import { Table, Tag, Space, Typography, Button, Input, message, Modal } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { calculateDuration } from '@/utils/time';
import Panel from '@/components/panel';
import { Icons } from '@/components/icons';
import { useDebounce } from '@uidotdev/usehooks';
import NamespaceEditorDrawer from './namespace-editor-drawer';

// API endpoint for federation namespaces
const API_ENDPOINT = '/api/v1/namespace';

// Type for namespace items based on API response
interface NamespaceItem {
  objectMeta: {
    name: string;
    creationTimestamp: string;
    uid: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  typeMeta: {
    kind: string;
  };
  status: {
    phase: string;
  };
}

const FederationNamespacesPage = () => {
  const [data, setData] = useState<NamespaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [filter, setFilter] = useState({
    searchText: '',
  });
  const debouncedSearchText = useDebounce(filter.searchText, 300);

  // Drawer state
  const [editorDrawerData, setEditorDrawerData] = useState<{
    open: boolean;
    mode: 'create' | 'edit' | 'detail';
    name?: string;
    namespaceContent?: string;
  }>({
    open: false,
    mode: 'create',
  });

  // Function to fetch namespace details
  const fetchNamespaceDetails = async (namespaceName: string) => {
    try {
      const response = await axios.get(`${API_ENDPOINT}/detail/${namespaceName}`);
      // Handle the response based on the API structure
      if (response.data?.code === 200 && response.data?.data) {
        return response.data.data;
      }
      messageApi.error(`Failed to fetch namespace details: Invalid response format`);
      return null;
    } catch (error) {
      messageApi.error(`Failed to fetch namespace details`);
      return null;
    }
  };

  // Function to reset drawer state
  const resetDrawerState = () => {
    setEditorDrawerData({
      open: false,
      mode: 'create',
    });
  };

  // Load namespaces based on filters
  useEffect(() => {
    setLoading(true);
    
    const params: Record<string, string> = {};
    if (debouncedSearchText) {
      params.keyword = debouncedSearchText;
    }
    
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API_ENDPOINT}?${queryString}` : API_ENDPOINT;
    
    axios
      .get(url)
      .then((res) => {
        if (res.data?.code === 200 && res.data?.data) {
          // Get data from the appropriate key in the response
          const items = res.data.data?.namespaces || res.data.data?.items || [];
          setData(items);
        } else {
          setData([]);
        }
      })
      .catch((err) => {
        messageApi.error(err.message || 'Failed to load namespaces');
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearchText, messageApi]);

  // Get status color based on phase
  const getStatusColor = (phase: string) => {
    const phaseMap: Record<string, string> = {
      Active: 'green',
      Terminating: 'orange',
      Pending: 'gold',
    };
    return phaseMap[phase] || 'default';
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: ['objectMeta', 'name'],
      key: 'name',
      render: (text: string) => <Typography.Link>{text}</Typography.Link>,
    },
    {
      title: 'Status',
      dataIndex: ['status', 'phase'],
      key: 'status',
      render: (phase: string) => <Tag color={getStatusColor(phase)}>{phase || 'Unknown'}</Tag>,
    },
    {
      title: 'Age',
      key: 'age',
      render: (_: any, record: NamespaceItem) => {
        if (!record.objectMeta?.creationTimestamp) return '-';
        return (
          <Space>
            <ClockCircleOutlined />
            {calculateDuration(record.objectMeta.creationTimestamp)}
          </Space>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: NamespaceItem) => (
        <Space.Compact>
          <Button
            size={'small'}
            type="link"
            onClick={async () => {
              // View details action
              const namespaceName = record.objectMeta?.name;
              const details = await fetchNamespaceDetails(namespaceName);
              
              if (details) {
                setEditorDrawerData({
                  open: true,
                  mode: 'detail',
                  name: namespaceName,
                  namespaceContent: details,
                });
              }
            }}
          >
            View
          </Button>
          <Button
            size={'small'}
            type="link"
            onClick={async () => {
              // Edit action
              const namespaceName = record.objectMeta?.name;
              const details = await fetchNamespaceDetails(namespaceName);
              
              if (details) {
                setEditorDrawerData({
                  open: true,
                  mode: 'edit',
                  name: namespaceName,
                  namespaceContent: details,
                });
              }
            }}
          >
            Edit
          </Button>
          <Button
            size={'small'}
            type="link"
            danger
            onClick={() => {
              // Delete action - show confirmation modal
              const namespaceName = record.objectMeta?.name;
              
              // Display confirmation dialog using Ant Design's Modal.confirm
              Modal.confirm({
                title: `Delete Namespace`,
                content: `Are you sure you want to delete ${namespaceName}? This will delete all resources within this namespace.`,
                okText: 'Yes',
                okType: 'danger',
                cancelText: 'No',
                onOk: async () => {
                  try {
                    await axios.delete(`${API_ENDPOINT}/${namespaceName}`);
                    messageApi.success(`Namespace deleted successfully`);
                    // Refresh the data
                    const newParams: Record<string, string> = {};
                    if (debouncedSearchText) {
                      newParams.keyword = debouncedSearchText;
                    }
                    
                    const queryString = new URLSearchParams(newParams).toString();
                    const url = queryString ? `${API_ENDPOINT}?${queryString}` : API_ENDPOINT;
                    
                    setLoading(true);
                    axios
                      .get(url)
                      .then((res) => {
                        if (res.data?.code === 200 && res.data?.data) {
                          setData(res.data.data?.namespaces || res.data.data?.items || []);
                        } else {
                          setData([]);
                        }
                      })
                      .catch(() => {
                        messageApi.error('Failed to refresh namespace list');
                        setData([]);
                      })
                      .finally(() => setLoading(false));
                  } catch (error) {
                    messageApi.error(`Failed to delete namespace`);
                  }
                },
              });
            }}
          >
            Delete
          </Button>
        </Space.Compact>
      ),
    },
  ];

  return (
    <Panel showSelectCluster={false}>
      <div className="flex flex-row mb-4 justify-between">
        <div className="flex flex-row space-x-4">
          <Input.Search
            placeholder="Search by name, press Enter to search"
            className="w-[400px]"
            value={filter.searchText}
            onChange={(e) => {
              setFilter({
                ...filter,
                searchText: e.target.value,
              });
            }}
          />
        </div>
        <div>
          <Button
            type="primary"
            icon={<Icons.add width={16} height={16} />}
            className="flex flex-row items-center"
            onClick={() => {
              setEditorDrawerData({
                open: true,
                mode: 'create',
              });
            }}
          >
            Create Namespace
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey={(record) => record.objectMeta?.uid || record.objectMeta?.name}
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: 'No namespaces found' }}
      />

      {/* Namespace Editor Drawer */}
      {editorDrawerData.open && (
        <NamespaceEditorDrawer
          open={editorDrawerData.open}
          mode={editorDrawerData.mode}
          name={editorDrawerData.name}
          namespaceContent={editorDrawerData.namespaceContent}
          onClose={resetDrawerState}
          onCreate={(ret) => {
            if (ret.code === 200 || ret.code === 201) {
              messageApi.success(`Namespace created successfully`);
              resetDrawerState();
              // Refresh the namespace list
              setLoading(true);
              axios
                .get(API_ENDPOINT)
                .then((res) => {
                  if (res.data?.code === 200 && res.data?.data) {
                    setData(res.data.data?.namespaces || res.data.data?.items || []);
                  } else {
                    setData([]);
                  }
                })
                .catch(() => {
                  messageApi.error('Failed to refresh namespace list');
                  setData([]);
                })
                .finally(() => setLoading(false));
            } else {
              messageApi.error(`Failed to create namespace: ${ret.message}`);
            }
          }}
          onUpdate={(ret) => {
            if (ret.code === 200) {
              messageApi.success(`Namespace updated successfully`);
              resetDrawerState();
              // Refresh the namespace list
              setLoading(true);
              axios
                .get(API_ENDPOINT)
                .then((res) => {
                  if (res.data?.code === 200 && res.data?.data) {
                    setData(res.data.data?.namespaces || res.data.data?.items || []);
                  } else {
                    setData([]);
                  }
                })
                .catch(() => {
                  messageApi.error('Failed to refresh namespace list');
                  setData([]);
                })
                .finally(() => setLoading(false));
            } else {
              messageApi.error(`Failed to update namespace: ${ret.message}`);
            }
          }}
        />
      )}
      
      {contextHolder}
    </Panel>
  );
};

export default FederationNamespacesPage;
