import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Popconfirm, Space, Table, Tag, Card, Row, Col, Radio, Tooltip, Flex } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { SearchOutlined, PlusOutlined, TableOutlined, AppstoreOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { ArgoApplication, DeleteArgoApplication, GetArgoApplications } from '../../../services/argocd';
import useCluster from '@/hooks/use-cluster';
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

    const { clusterOptions, selectedCluster } = useCluster({});

    const [filter, setFilter] = useState({
        searchText: '',
    });

    // View mode: 'table' or 'card'
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

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
        queryKey: ['get-argo-applications', selectedCluster.value],
        queryFn: async () => {
            const applications = await GetArgoApplications({
                selectedCluster,
            });
            return applications.data || {};
        },
        refetchInterval: 5000,
    });

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
        ...(selectedCluster.value === 'ALL' ? [{
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
                    <Tooltip title="View">
                        <Button
                            size='middle'
                            type="link"
                            icon={<EyeOutlined />}
                            onClick={() => {
                                setDrawerState({
                                    open: true,
                                    application: record,
                                });
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button
                            size='middle'
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => {
                                setModalState({
                                    open: true,
                                    mode: 'edit',
                                    application: record,
                                    cluster: record.metadata?.labels?.cluster || selectedCluster.value,
                                });
                            }}
                        />
                    </Tooltip>

                    <Popconfirm
                        placement="topRight"
                        title={`Do you want to delete "${record.metadata?.name}" application?`}
                        onConfirm={async () => {
                            const response = await DeleteArgoApplication(record.metadata?.labels?.cluster || selectedCluster.value, record.metadata?.name);
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
                        <Button size='middle' type="link" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space.Compact>
            ),
        }
    ];

    // Card view component for applications
    const ApplicationCards = () => (
        <Row gutter={[16, 16]}>
            {filteredApplications.map((app: ArgoApplication) => (
                <Col key={`${app?.metadata?.name}-${app?.metadata?.namespace}-${app?.metadata?.labels?.cluster}`} xs={24} sm={12} md={8} lg={6}>
                    <Card
                        hoverable
                        className='shadow-md'
                        title={
                            <Tooltip title={app.metadata?.name}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className='text-blue-500'>
                                    {app.metadata?.name}
                                </div>
                            </Tooltip>
                        }
                        extra={
                            <Space>
                                <Tag color={getSyncStatusColor(app.status?.sync?.status || '')}>
                                    {app.status?.sync?.status || 'Unknown'}
                                </Tag>
                                <Tag color={getHealthStatusColor(app.status?.health?.status || '')}>
                                    {app.status?.health?.status || 'Unknown'}
                                </Tag>
                            </Space>
                        }
                        actions={[
                            <Tooltip key="view" title="View">
                                <Button
                                    type="text"
                                    icon={<EyeOutlined />}
                                    onClick={() => {
                                        setDrawerState({
                                            open: true,
                                            application: app,
                                        });
                                    }}
                                />
                            </Tooltip>,
                            <Tooltip key="edit" title="Edit">
                                <Button
                                    type="text"
                                    icon={<EditOutlined />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setModalState({
                                            open: true,
                                            mode: 'edit',
                                            application: app,
                                            cluster: app.metadata?.labels?.cluster || selectedCluster.value,
                                        });
                                    }}
                                />
                            </Tooltip>,
                            <Popconfirm
                                key="delete"
                                placement="topRight"
                                title={`Do you want to delete "${app.metadata?.name}" application?`}
                                onConfirm={async () => {
                                    const response = await DeleteArgoApplication(app.metadata?.labels?.cluster || selectedCluster.value, app.metadata?.name);
                                    if (response.code === 200) {
                                        refetch();
                                    }
                                }}
                                okText="Confirm"
                                cancelText="Cancel"
                            >
                                <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>,
                        ]}
                    >
                        <div style={{ marginBottom: 12 }}>
                            {selectedCluster.value === 'ALL' && (
                                <div style={{ marginBottom: 8 }}>
                                    <span style={{ fontWeight: 'bold' }}>Cluster:</span> {app.metadata?.labels?.cluster || '-'}
                                </div>
                            )}
                            <div style={{ marginBottom: 8 }}>
                                <span style={{ fontWeight: 'bold' }}>Project:</span>{' '}
                                <Button
                                    type="link"
                                    size="small"
                                    style={{ padding: 0 }}
                                    onClick={() => {
                                        navigate(`/continuous-delivery/project?action=view&name=${app.spec?.project}&cluster=${app.metadata?.labels?.cluster}`);
                                    }}
                                >
                                    {app.spec?.project}
                                </Button>
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <span style={{ fontWeight: 'bold' }}>Namespace:</span> {app.spec?.destination?.namespace || '-'}
                            </div>
                            <div>
                                <span style={{ fontWeight: 'bold' }}>Age:</span> {calculateDuration(app.metadata?.creationTimestamp)}
                            </div>
                        </div>
                    </Card>
                </Col>
            ))}
        </Row>
    );

    return (
        <Panel>
            <div className={'flex flex-row justify-between space-x-4 mb-4'}>
                <Space wrap>
                    <Input
                        placeholder="Search applications..."
                        value={filter.searchText}
                        onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
                        prefix={<SearchOutlined />}
                        style={{ width: 250 }}
                    />
                </Space>
                <Flex>
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
                    <Radio.Group className='ml-4' value={viewMode} onChange={e => setViewMode(e.target.value)}>
                        <Radio.Button value="table"><TableOutlined /> Table</Radio.Button>
                        <Radio.Button value="card"><AppstoreOutlined /> Cards</Radio.Button>
                    </Radio.Group>
                </Flex>
            </div>

            {/* Conditionally render table or card view based on viewMode */}
            {viewMode === 'table' ? (
                <Table
                    columns={columns}
                    dataSource={filteredApplications}
                    rowKey={(record) => `${record?.metadata?.name}-${record?.metadata?.namespace}-${record?.metadata?.labels?.cluster}`}
                    loading={isLoading}
                />
            ) : (
                <div style={{ position: 'relative', minHeight: '200px' }}>
                    {isLoading ? (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                            Loading...
                        </div>
                    ) : (
                        <ApplicationCards />
                    )}
                </div>
            )}

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