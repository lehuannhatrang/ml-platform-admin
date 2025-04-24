import { useState, useEffect } from 'react';
import { Tabs, Table, Tag, Space, Typography, Button, Input, message, Select, Modal } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { calculateDuration } from '@/utils/time';
import Panel from '@/components/panel';
import { Icons } from '@/components/icons';
import { useDebounce } from '@uidotdev/usehooks';
import useNamespace from '@/hooks/use-namespace';
import WorkloadEditorDrawer from './workload-editor-drawer';
import { IResponse } from '@/services/base';

const workloadTypes = [
  { key: 'deployment', label: 'Deployment', api: '/api/v1/deployment', dataKey: 'deployments' },
  { key: 'daemonset', label: 'DaemonSet', api: '/api/v1/daemonset', dataKey: 'daemonSets' },
  { key: 'cronjob', label: 'CronJob', api: '/api/v1/cronjob', dataKey: 'cronJobs' },
  { key: 'job', label: 'Job', api: '/api/v1/job', dataKey: 'jobs' },
];

// Type for workload items based on the API response
interface PodInfo {
  current: number;
  desired: number;
  running: number;
  pending: number;
  failed: number;
  succeeded: number;
  warnings: any[];
}

interface WorkloadItem {
  objectMeta: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    uid: string;
    annotations?: Record<string, string>;
  };
  typeMeta: {
    kind: string;
    scalable?: boolean;
    restartable?: boolean;
  };
  pods?: PodInfo;
  podInfo?: PodInfo; // DaemonSets use "podInfo" instead of "pods"
  containerImages: string[];
  initContainerImages: any;
}

const FederationWorkloadsPage = () => {
  const [activeTab, setActiveTab] = useState('deployment');
  const [data, setData] = useState<WorkloadItem[]>([]);
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
    type: 'deployment' | 'daemonset' | 'cronjob' | 'job';
    name?: string;
    namespace?: string;
    workloadContent?: string;
  }>({
    open: false,
    mode: 'create',
    type: 'deployment',
  });

  const activeWorkloadType = workloadTypes.find(type => type.key === activeTab);
  const activeApi = activeWorkloadType?.api || '';
  const activeDataKey = activeWorkloadType?.dataKey || '';

  // Function to fetch workload details
  const fetchWorkloadDetails = async (workloadName: string, namespace: string, type: string) => {
    try {
      const response = await axios.get(`${activeApi}/${namespace}/${workloadName}`);
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
      type: activeTab as 'deployment' | 'daemonset' | 'cronjob' | 'job',
    });
  };

  // Load workloads based on active tab and filters
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
          // Get data from the appropriate key in the response (deployments, daemonSets, etc.)
          const items = res.data.data?.deployments || res.data.data?.daemonSets || res.data.data?.items || res.data.data?.jobs || [];
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
      type: activeTab as 'deployment' | 'daemonset' | 'cronjob' | 'job'
    }));
  }, [activeTab]);

  // Get pod info handling both pods and podInfo structures
  const getPodInfo = (item: WorkloadItem): PodInfo => {
    return item.pods || item.podInfo || {
      current: 0,
      desired: 0,
      running: 0,
      pending: 0,
      failed: 0,
      succeeded: 0,
      warnings: []
    };
  };

  // Get status from pods
  const getStatusFromPods = (item: WorkloadItem) => {
    const podInfo = getPodInfo(item);
    
    if (podInfo.running > 0) return { status: 'Running', color: 'green' };
    if (podInfo.pending > 0) return { status: 'Pending', color: 'gold' };
    if (podInfo.failed > 0) return { status: 'Failed', color: 'red' };
    if (podInfo.succeeded > 0) return { status: 'Succeeded', color: 'blue' };
    return { status: 'Unknown', color: 'gray' };
  };

  const columns = [
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
      title: 'Pods',
      key: 'pods',
      render: (_: any, record: WorkloadItem) => {
        const podInfo = getPodInfo(record);
        return (
          <span>
            {podInfo.running}/{podInfo.desired}
          </span>
        );
      },
    },
    {
      title: 'Images',
      key: 'images',
      render: (_: any, record: WorkloadItem) => (
        <Space direction="vertical" size="small">
          {record.containerImages.map((image, index) => (
            <Tag key={index}>{image}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Age',
      key: 'age',
      render: (_: any, record: WorkloadItem) => {
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
      title: 'Status',
      key: 'status',
      render: (_: any, record: WorkloadItem) => {
        const { status, color } = getStatusFromPods(record);
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: WorkloadItem) => (
        <Space.Compact>
          <Button
            size={'small'}
            type="link"
            onClick={async () => {
              // View details action
              const workloadName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              const details = await fetchWorkloadDetails(workloadName, namespace, activeTab);
              
              if (details) {
                setEditorDrawerData({
                  open: true,
                  mode: 'detail',
                  type: activeTab as 'deployment' | 'daemonset' | 'cronjob' | 'job',
                  name: workloadName,
                  namespace: namespace,
                  workloadContent: details,
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
              const workloadName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              const details = await fetchWorkloadDetails(workloadName, namespace, activeTab);
              
              if (details) {
                setEditorDrawerData({
                  open: true,
                  mode: 'edit',
                  type: activeTab as 'deployment' | 'daemonset' | 'cronjob' | 'job',
                  name: workloadName,
                  namespace: namespace,
                  workloadContent: details,
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
              const workloadName = record.objectMeta?.name;
              const namespace = record.objectMeta?.namespace;
              
              // Display confirmation dialog using Ant Design's Modal.confirm
              Modal.confirm({
                title: `Delete ${activeTab}`,
                content: `Are you sure you want to delete ${workloadName}?`,
                okText: 'Yes',
                okType: 'danger',
                cancelText: 'No',
                onOk: async () => {
                  try {
                    await axios.delete(`${activeApi}/${namespace}/${workloadName}`);
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
                          setData(res.data.data[activeDataKey] || []);
                        } else {
                          setData([]);
                        }
                      })
                      .catch(() => {
                        messageApi.error('Failed to refresh workload list');
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
        items={workloadTypes.map((tab) => ({
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
                        type: activeTab as 'deployment' | 'daemonset' | 'cronjob' | 'job',
                      });
                    }}
                  >
                    Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </Button>
                </div>
              </div>

              <Table
                columns={columns}
                dataSource={data}
                rowKey={(record) => record.objectMeta?.uid || record.objectMeta?.name}
                loading={loading}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: 'No resources found' }}
              />
            </>
          ),
        }))}
      />

      {/* Workload Editor Drawer */}
      <WorkloadEditorDrawer
        open={editorDrawerData.open}
        mode={editorDrawerData.mode}
        type={editorDrawerData.type}
        name={editorDrawerData.name}
        namespace={editorDrawerData.namespace}
        workloadContent={editorDrawerData.workloadContent}
        onClose={resetDrawerState}
        onCreate={(ret: IResponse<string>) => {
          if (ret.code === 200 || ret.code === 201) {
            messageApi.success(`${editorDrawerData.type} created successfully`);
            resetDrawerState();
            // Refresh the workload list
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
                  setData(res.data.data[activeDataKey] || []);
                } else {
                  setData([]);
                }
              })
              .catch(() => {
                messageApi.error('Failed to refresh workload list');
                setData([]);
              })
              .finally(() => setLoading(false));
          } else {
            messageApi.error(`Failed to create ${editorDrawerData.type}: ${ret.message}`);
          }
        }}
        onUpdate={(ret: IResponse<string>) => {
          if (ret.code === 200) {
            messageApi.success(`${editorDrawerData.type} updated successfully`);
            resetDrawerState();
            // Refresh the workload list
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
                  setData(res.data.data[activeDataKey] || []);
                } else {
                  setData([]);
                }
              })
              .catch(() => {
                messageApi.error('Failed to refresh workload list');
                setData([]);
              })
              .finally(() => setLoading(false));
          } else {
            messageApi.error(`Failed to update ${editorDrawerData.type}: ${ret.message}`);
          }
        }}
      />
      
      {contextHolder}
    </Panel>
  );
};

export default FederationWorkloadsPage;
