import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { ArgoApplication, DeleteArgoApplication, GetArgoApplications } from '../../../services/argocd';
import useCluster, { ClusterOption, DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import { calculateDuration } from '@/utils/time';
import Panel from '@/components/panel';
import i18nInstance from '@/utils/i18n';
import EditApplicationModal from './edit-application-modal';
import ApplicationInfoDrawer from './application-info-drawer';
import { getSyncStatusColor, getHealthStatusColor } from '@/utils/argo';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function ContinuousDeliveryApplicationPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    const action = searchParams.get('action');
    const name = searchParams.get('name');
    const cluster = searchParams.get('cluster');

    const navigate = useNavigate();

    const [filter, setFilter] = useState({
        selectedCluster: DEFAULT_CLUSTER_OPTION,
        searchText: '',
    });

    const [modalState, setModalState] = useState({
        open: false,
        mode: 'create' as 'create' | 'edit',
        application: undefined as ArgoApplication | undefined,
        cluster: '',
    });
    const [drawerState, setDrawerState] = useState({
        open: false,
        application: undefined as ArgoApplication | undefined,
    });

    const { data: argoApplicationsData, isLoading, refetch } = useQuery({
        queryKey: ['get-argo-applications', filter.selectedCluster.value],
        queryFn: async () => {
            const applications = await GetArgoApplications({
                selectedCluster: filter.selectedCluster,
            });
            return applications.data || {};
        },
    });

    const { clusterOptions, isClusterDataLoading } = useCluster({});

    useEffect(() => {
        if (action === 'view' && name && cluster && argoApplicationsData?.items) {
            const application = argoApplicationsData.items.find(app => app.metadata?.name === name && app.metadata?.labels?.cluster === cluster);
            if (application) {
                setDrawerState({
                    open: true,
                    application
                });
            }
        }
    }, [action, name, cluster, argoApplicationsData]);

    const filteredApplications = useMemo(() => {
        if (!filter.searchText) {
            return argoApplicationsData?.items || [];
        }

        const searchLower = filter.searchText.toLowerCase();
        return (argoApplicationsData?.items || []).filter((app: ArgoApplication) => {
            const name = app.metadata?.name?.toLowerCase() || '';
            return name.includes(searchLower);
        });
    }, [argoApplicationsData, filter.searchText]);

    const columns: ColumnsType<ArgoApplication> = [
        {
            title: 'Name',
            dataIndex: ['metadata', 'name'],
            key: 'name',
        },
        ...(filter.selectedCluster.value === 'ALL' ? [{
            title: 'Cluster',
            key: 'cluster',
            filters: clusterOptions.filter(option => option.value !== 'ALL').map((i) => ({ text: i.label, value: i.label })),
            onFilter: (value: React.Key | boolean, record: ArgoApplication) => record.metadata?.labels?.cluster === value,
            render: (_: any, r: ArgoApplication) => {
                return r.metadata?.labels?.cluster || '-';
            },
        }] : []),
        {
            title: 'Project',
            key: 'project',
            render: (_: any, record: ArgoApplication) => (
                <Button
                    type="link"
                    onClick={() => {
                        navigate(`/continuous-delivery/project?action=view&name=${record.spec?.project}&cluster=${record.metadata?.labels?.cluster}`);
                    }}
                >
                    {record.spec?.project}
                </Button>
            ),
        },
        {
            title: 'Namespace',
            dataIndex: ['spec', 'destination', 'namespace'],
            key: 'namespace',
        },
        {
            title: 'Sync Status',
            dataIndex: ['status', 'sync', 'status'],
            key: 'syncStatus',
            render: (status) => (
                <Tag color={getSyncStatusColor(status || '')}>
                    {status || 'Unknown'}
                </Tag>
            ),
        },
        {
            title: 'Health Status',
            dataIndex: ['status', 'health', 'status'],
            key: 'healthStatus',
            render: (status) => (
                <Tag color={getHealthStatusColor(status || '')}>
                    {status || 'Unknown'}
                </Tag>
            ),
        },
        {
            title: 'Age',
            dataIndex: ['metadata', 'creationTimestamp'],
            key: 'created',
            render: (timestamp) => calculateDuration(timestamp),
            width: 120,
            defaultSortOrder: 'descend',
            sorter: (a, b) => new Date(a.metadata?.creationTimestamp).getTime() - new Date(b.metadata?.creationTimestamp).getTime(),
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Space.Compact>
                    <Button
                        size={'small'}
                        type="link"
                        onClick={() => {
                            setDrawerState({
                                open: true,
                                application: record,
                            });
                        }}
                    >
                        {i18nInstance.t('607e7a4f377fa66b0b28ce318aab841f', '查看')}
                    </Button>
                    <Button
                        size={'small'}
                        type="link"
                        onClick={() => {
                            setModalState({
                                open: true,
                                mode: 'edit',
                                application: record,
                                cluster: record.metadata?.labels?.cluster || filter.selectedCluster.value,
                            });
                        }}
                    >
                        {i18nInstance.t('95b351c86267f3aedf89520959bce689', '编辑')}
                    </Button>

                    <Popconfirm
                        placement="topRight"
                        title={`Do you want to delete "${record.metadata?.name}" application?`}
                        onConfirm={async () => {
                            const response = await DeleteArgoApplication(record.metadata?.labels?.cluster || filter.selectedCluster.value, record.metadata?.name);
                            if (response.code === 200) {
                                refetch();
                            }
                        }}
                        okText={i18nInstance.t(
                            'e83a256e4f5bb4ff8b3d804b5473217a',
                            '确认',
                        )}
                        cancelText={i18nInstance.t(
                            '625fb26b4b3340f7872b411f401e754c',
                            '取消',
                        )}
                    >
                        <Button size={'small'} type="link" danger>
                            {i18nInstance.t('2f4aaddde33c9b93c36fd2503f3d122b', '删除')}
                        </Button>
                    </Popconfirm>
                </Space.Compact>
            ),
        }
    ];

    return (
        <Panel>
            <div className={'flex flex-row justify-between space-x-4 mb-4'}>
                <Space wrap>
                    <Select
                        value={filter.selectedCluster?.value}
                        style={{ width: 200 }}
                        onChange={(_v: string, option: ClusterOption | ClusterOption[]) => 
                            setFilter({ ...filter, selectedCluster: option as ClusterOption })
                        }
                        options={clusterOptions}
                        loading={isClusterDataLoading}
                        placeholder="Select Cluster"
                    />
                    <Input
                        placeholder="Search applications..."
                        value={filter.searchText}
                        onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
                        prefix={<SearchOutlined />}
                        style={{ width: 250 }}
                    />
                </Space>
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setModalState({
                            open: true,
                            mode: 'create',
                            application: undefined,
                            cluster: '',
                        });
                    }}
                >
                    Create Application
                </Button>
            </div>
            <Table
                columns={columns}
                dataSource={filteredApplications}
                rowKey={(record) => `${record?.metadata?.name}-${record?.metadata?.namespace}-${record?.metadata?.labels?.cluster}`}
                loading={isLoading}
            />

            {/* Application Create/Edit Modal */}
            <EditApplicationModal
                mode={modalState.mode}
                open={modalState.open}
                cluster={modalState.cluster}
                application={modalState.application}
                onCancel={() => setModalState({ ...modalState, open: false })}
                onSuccess={() => {
                    setModalState({ ...modalState, open: false });
                    refetch();
                }}
            />

            {/* Application Info Drawer */}
            <ApplicationInfoDrawer
                open={drawerState.open}
                application={drawerState.application}
                onClose={() => {
                    setSearchParams({});
                    setDrawerState({ ...drawerState, open: false })
                }}
            />
        </Panel>
    );
}