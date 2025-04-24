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
import { Tabs, Table, Tag, Space, Typography, Button, Input, message, Select, Modal } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { calculateDuration } from '@/utils/time';
import Panel from '@/components/panel';
import { Icons } from '@/components/icons';
import { useDebounce } from '@uidotdev/usehooks';
import useNamespace from '@/hooks/use-namespace';
import ServiceEditorDrawer from './service-editor-drawer';
import type { ColumnsType } from 'antd/es/table';

const serviceTypes = [
  { key: 'service', label: 'Service', api: '/api/v1/service', dataKey: 'services' },
  { key: 'ingress', label: 'Ingress', api: '/api/v1/ingress', dataKey: 'ingresses' },
];

// Base metadata type common to both service and ingress
interface ObjectMeta {
  name: string;
  namespace: string;
  creationTimestamp: string;
  uid: string;
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
}

interface TypeMeta {
  kind: string;
}

// Type for service items based on the API response
interface PortInfo {
  port: number;
  protocol: string;
  targetPort: number | string;
  nodePort?: number;
}

interface ServiceItem {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  type: string;
  clusterIP: string;
  ports: PortInfo[];
  externalIPs?: string[];
  internalEndpoint?: string;
  externalEndpoint?: string;
}

// Type for ingress items
interface IngressRule {
  host: string;
  paths: {
    path: string;
    pathType: string;
    backend: {
      service: {
        name: string;
        port: {
          number: number;
        };
      };
    };
  }[];
}

interface IngressItem {
  objectMeta: ObjectMeta;
  typeMeta: TypeMeta;
  status: {
    loadBalancer: {
      ingress: {
        ip?: string;
        hostname?: string;
      }[];
    };
  };
  tls: {
    hosts: string[];
    secretName: string;
  }[];
  rules: IngressRule[];
}

// Union type for both item types
type FederationServiceItem = ServiceItem | IngressItem;

// Type for API responses
interface ApiResponse {
  code: number;
  message: string;
}

const FederationServicesPage = () => {
  const [activeTab, setActiveTab] = useState('service');
  const [data, setData] = useState<FederationServiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [filter, setFilter] = useState({
    namespace: '',
    searchText: '',
  });
  const debouncedSearchText = useDebounce(filter.searchText, 300);
  const { nsOptions, isNsDataLoading } = useNamespace({});

  // Drawer state
  const [editorDrawerData, setEditorDrawerData] = useState<{
    open: boolean;
    mode: 'create' | 'edit' | 'detail';
    type: 'service' | 'ingress';
    name?: string;
    namespace?: string;
    serviceContent?: string;
  }>({
    open: false,
    mode: 'create',
    type: 'service',
  });

  const activeServiceType = serviceTypes.find(type => type.key === activeTab);
  const activeApi = activeServiceType?.api || '';
  const activeDataKey = activeServiceType?.dataKey || '';

  // Function to fetch service/ingress details
  const fetchServiceDetails = async (itemName: string, namespace: string, type: string) => {
    try {
      const response = await axios.get(`${activeApi}/${namespace}/${itemName}`);
      // Handle the response based on the API structure
      if (response.data?.code === 200 && response.data?.data) {
        return response.data.data;
      }
      messageApi.error(`Failed to fetch ${type} details: Invalid response format`);
      return null;
    } catch (error) {
      messageApi.error(`Failed to fetch ${type} details`);
      return null;
    }
  };

  // Function to reset drawer state
  const resetDrawerState = () => {
    setEditorDrawerData({
      open: false,
      mode: 'create',
      type: activeTab as 'service' | 'ingress',
    });
  };

  // Load services/ingresses based on active tab and filters
  useEffect(() => {
    if (!activeApi) return;
    
    setLoading(true);
    
    const params: Record<string, string> = {};
    if (filter.namespace) {
      params.namespace = filter.namespace;
    }
    if (debouncedSearchText) {
      params.keyword = debouncedSearchText;
    }
    
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${activeApi}?${queryString}` : activeApi;
    
    axios
      .get(url)
      .then((res) => {
        if (res.data?.code === 200 && res.data?.data) {
          // Get data from the appropriate key in the response
          const items = res.data.data?.services || res.data.data?.ingresses || res.data.data?.items || [];
          setData(items);
        } else {
          setData([]);
        }
      })
      .catch((err) => {
        messageApi.error(err.message || 'Failed to load resources');
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [activeTab, activeApi, activeDataKey, filter.namespace, debouncedSearchText, messageApi]);

  // Update drawer type when tab changes
  useEffect(() => {
    setEditorDrawerData(prev => ({
      ...prev,
      type: activeTab as 'service' | 'ingress'
    }));
  }, [activeTab]);

  // Service type color
  const getServiceTypeColor = (type: string) => {
    const typeColors: Record<string, string> = {
      ClusterIP: 'blue',
      NodePort: 'green',
      LoadBalancer: 'purple',
      ExternalName: 'orange',
    };
    return typeColors[type] || 'default';
  };

  // Define columns for service tab
  const serviceColumns: ColumnsType<ServiceItem> = [
    {
      title: 'Name',
      dataIndex: ['objectMeta', 'name'],
      key: 'name',
      render: (text: string) => <Typography.Link>{text}</Typography.Link>,
    },
    {
      title: 'Namespace',
      dataIndex: ['objectMeta', 'namespace'],
      key: 'namespace',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color={getServiceTypeColor(type)}>{type}</Tag>,
    },
    {
      title: 'Cluster IP',
      dataIndex: 'clusterIP',
      key: 'clusterIP',
    },
    {
      title: 'Ports',
      key: 'ports',
      render: (_: any, record: ServiceItem) => (
        <Space direction="vertical" size="small">
          {record.ports?.map((port, index) => (
            <Tag key={index}>
              {port.port}:{port.targetPort}/{port.protocol}
              {port.nodePort && ` (${port.nodePort})`}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'External IP',
      key: 'externalIP',
      render: (_: any, record: ServiceItem) => (
        <Space direction="vertical" size="small">
          {record.externalIPs?.map((ip, index) => (
            <Tag key={index}>{ip}</Tag>
          ))}
          {(!record.externalIPs || record.externalIPs.length === 0) && '-'}
        </Space>
      ),
    },
    {
      title: 'Age',
      key: 'age',
      render: (_: any, record: ServiceItem) => {
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
      render: (_: any, record: ServiceItem) => (
        <Space.Compact>
          <Button
            size={'small'}
            type="link"
            onClick={async () => {
              // View details action
              const itemName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              const details = await fetchServiceDetails(itemName, namespace, activeTab);
              
              if (details) {
                setEditorDrawerData({
                  open: true,
                  mode: 'detail',
                  type: activeTab as 'service' | 'ingress',
                  name: itemName,
                  namespace: namespace,
                  serviceContent: details,
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
              const itemName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              const details = await fetchServiceDetails(itemName, namespace, activeTab);
              
              if (details) {
                setEditorDrawerData({
                  open: true,
                  mode: 'edit',
                  type: activeTab as 'service' | 'ingress',
                  name: itemName,
                  namespace: namespace,
                  serviceContent: details,
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
              const itemName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              
              // Display confirmation dialog using Ant Design's Modal.confirm
              Modal.confirm({
                title: `Delete ${activeTab}`,
                content: `Are you sure you want to delete ${itemName}?`,
                okText: 'Yes',
                okType: 'danger',
                cancelText: 'No',
                onOk: async () => {
                  try {
                    await axios.delete(`${activeApi}/${namespace}/${itemName}`);
                    messageApi.success(`${activeTab} deleted successfully`);
                    // Refresh the data
                    const newParams: Record<string, string> = {};
                    if (filter.namespace) {
                      newParams.namespace = filter.namespace;
                    }
                    if (debouncedSearchText) {
                      newParams.keyword = debouncedSearchText;
                    }
                    
                    const queryString = new URLSearchParams(newParams).toString();
                    const url = queryString ? `${activeApi}?${queryString}` : activeApi;
                    
                    setLoading(true);
                    axios
                      .get(url)
                      .then((res) => {
                        if (res.data?.code === 200 && res.data?.data) {
                          setData(res.data.data?.services || res.data.data?.ingresses || res.data.data?.items || []);
                        } else {
                          setData([]);
                        }
                      })
                      .catch(() => {
                        messageApi.error('Failed to refresh list');
                        setData([]);
                      })
                      .finally(() => setLoading(false));
                  } catch (error) {
                    messageApi.error(`Failed to delete ${activeTab}`);
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

  // Define columns for ingress tab
  const ingressColumns: ColumnsType<IngressItem> = [
    {
      title: 'Name',
      dataIndex: ['objectMeta', 'name'],
      key: 'name',
      render: (text: string) => <Typography.Link>{text}</Typography.Link>,
    },
    {
      title: 'Namespace',
      dataIndex: ['objectMeta', 'namespace'],
      key: 'namespace',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Hosts',
      key: 'hosts',
      render: (_: any, record: IngressItem) => (
        <Space direction="vertical" size="small">
          {record.rules?.map((rule, index) => (
            <Tag key={index}>{rule.host}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Paths',
      key: 'paths',
      render: (_: any, record: IngressItem) => (
        <Space direction="vertical" size="small">
          {record.rules?.flatMap((rule, ruleIndex) => 
            rule.paths?.map((path, pathIndex) => (
              <Tag key={`${ruleIndex}-${pathIndex}`}>
                {path.path} → {path.backend.service.name}:{path.backend.service.port.number}
              </Tag>
            ))
          )}
        </Space>
      ),
    },
    {
      title: 'TLS',
      key: 'tls',
      render: (_: any, record: IngressItem) => (
        <Space direction="vertical" size="small">
          {record.tls?.map((tls, index) => (
            <Tag key={index} color="green">{tls.secretName}</Tag>
          ))}
          {(!record.tls || record.tls.length === 0) && '-'}
        </Space>
      ),
    },
    {
      title: 'Address',
      key: 'address',
      render: (_: any, record: IngressItem) => {
        const addresses = record.status?.loadBalancer?.ingress || [];
        return (
          <Space direction="vertical" size="small">
            {addresses.map((addr, index) => (
              <span key={index}>{addr.ip || addr.hostname || '-'}</span>
            ))}
            {addresses.length === 0 && '-'}
          </Space>
        );
      },
    },
    {
      title: 'Age',
      key: 'age',
      render: (_: any, record: IngressItem) => {
        if (!record.objectMeta?.creationTimestamp) return '-';
        return (
          <Space>
            <ClockCircleOutlined />
            {calculateDuration(record.objectMeta.creationTimestamp)}
          </Space>
        );
      },
    },
    // Actions column same as services
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: IngressItem) => (
        <Space.Compact>
          <Button
            size={'small'}
            type="link"
            onClick={async () => {
              // View details action
              const itemName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              const details = await fetchServiceDetails(itemName, namespace, activeTab);
              
              if (details) {
                setEditorDrawerData({
                  open: true,
                  mode: 'detail',
                  type: activeTab as 'service' | 'ingress',
                  name: itemName,
                  namespace: namespace,
                  serviceContent: details,
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
              const itemName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              const details = await fetchServiceDetails(itemName, namespace, activeTab);
              
              if (details) {
                setEditorDrawerData({
                  open: true,
                  mode: 'edit',
                  type: activeTab as 'service' | 'ingress',
                  name: itemName,
                  namespace: namespace,
                  serviceContent: details,
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
              const itemName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              
              Modal.confirm({
                title: `Delete ${activeTab}`,
                content: `Are you sure you want to delete ${itemName}?`,
                okText: 'Yes',
                okType: 'danger',
                cancelText: 'No',
                onOk: async () => {
                  try {
                    await axios.delete(`${activeApi}/${namespace}/${itemName}`);
                    messageApi.success(`${activeTab} deleted successfully`);
                    // Refresh the data
                    const newParams: Record<string, string> = {};
                    if (filter.namespace) {
                      newParams.namespace = filter.namespace;
                    }
                    if (debouncedSearchText) {
                      newParams.keyword = debouncedSearchText;
                    }
                    
                    const queryString = new URLSearchParams(newParams).toString();
                    const url = queryString ? `${activeApi}?${queryString}` : activeApi;
                    
                    setLoading(true);
                    axios
                      .get(url)
                      .then((res) => {
                        if (res.data?.code === 200 && res.data?.data) {
                          setData(res.data.data?.services || res.data.data?.ingresses || res.data.data?.items || []);
                        } else {
                          setData([]);
                        }
                      })
                      .catch(() => {
                        messageApi.error('Failed to refresh list');
                        setData([]);
                      })
                      .finally(() => setLoading(false));
                  } catch (error) {
                    messageApi.error(`Failed to delete ${activeTab}`);
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
    <Panel>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={serviceTypes.map((tab) => ({
          key: tab.key,
          label: tab.label,
          children: (
            <>
              <div className="flex flex-row mb-4 justify-between">
                <div className="flex flex-row space-x-4">
                  <>
                    <h3 className="leading-[32px]">Namespace</h3>
                    <Select
                      options={nsOptions}
                      className="min-w-[200px]"
                      value={filter.namespace}
                      loading={isNsDataLoading}
                      showSearch
                      allowClear
                      placeholder=""
                      onChange={(v: string) => {
                        setFilter({
                          ...filter,
                          namespace: v,
                        });
                      }}
                    />
                  </>
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
                        type: activeTab as 'service' | 'ingress',
                      });
                    }}
                  >
                    Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </Button>
                </div>
              </div>

              <Table
                columns={activeTab === 'service' ? serviceColumns : ingressColumns}
                dataSource={data as any[]}
                rowKey={(record) => record.objectMeta?.uid || record.objectMeta?.name}
                loading={loading}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: `No ${activeTab}s found` }}
              />
            </>
          ),
        }))}
      />

      {/* Service Editor Drawer */}
      {editorDrawerData.open && (
        <ServiceEditorDrawer
          open={editorDrawerData.open}
          mode={editorDrawerData.mode}
          type={editorDrawerData.type}
          name={editorDrawerData.name}
          namespace={editorDrawerData.namespace}
          serviceContent={editorDrawerData.serviceContent}
          onClose={resetDrawerState}
          onCreate={(ret: ApiResponse) => {
            if (ret.code === 200 || ret.code === 201) {
              messageApi.success(`${editorDrawerData.type} created successfully`);
              resetDrawerState();
              // Refresh the list
              const params: Record<string, string> = {};
              if (filter.namespace) {
                params.namespace = filter.namespace;
              }
              
              const queryString = new URLSearchParams(params).toString();
              const url = queryString ? `${activeApi}?${queryString}` : activeApi;
              
              setLoading(true);
              axios
                .get(url)
                .then((res) => {
                  if (res.data?.code === 200 && res.data?.data) {
                    setData(res.data.data?.services || res.data.data?.ingresses || res.data.data?.items || []);
                  } else {
                    setData([]);
                  }
                })
                .catch(() => {
                  messageApi.error('Failed to refresh list');
                  setData([]);
                })
                .finally(() => setLoading(false));
            } else {
              messageApi.error(`Failed to create ${editorDrawerData.type}: ${ret.message}`);
            }
          }}
          onUpdate={(ret: ApiResponse) => {
            if (ret.code === 200) {
              messageApi.success(`${editorDrawerData.type} updated successfully`);
              resetDrawerState();
              // Refresh the list
              const params: Record<string, string> = {};
              if (filter.namespace) {
                params.namespace = filter.namespace;
              }
              
              const queryString = new URLSearchParams(params).toString();
              const url = queryString ? `${activeApi}?${queryString}` : activeApi;
              
              setLoading(true);
              axios
                .get(url)
                .then((res) => {
                  if (res.data?.code === 200 && res.data?.data) {
                    setData(res.data.data?.services || res.data.data?.ingresses || res.data.data?.items || []);
                  } else {
                    setData([]);
                  }
                })
                .catch(() => {
                  messageApi.error('Failed to refresh list');
                  setData([]);
                })
                .finally(() => setLoading(false));
            } else {
              messageApi.error(`Failed to update ${editorDrawerData.type}: ${ret.message}`);
            }
          }}
        />
      )}
      
      {contextHolder}
    </Panel>
  );
};

export default FederationServicesPage;
