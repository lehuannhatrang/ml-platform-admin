import { useMemo, useState } from 'react';
import { Button, Input, Popconfirm, Select, Space, Table, Tag, Tooltip } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { SearchOutlined } from '@ant-design/icons';
import { ArgoApplication, GetArgoApplications } from '../../../services/argocd';
import useCluster, { DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import { calculateDuration } from '@/utils/time';
import Panel from '@/components/panel';
import i18nInstance from '@/utils/i18n';

export default function ContinuousDeliveryApplicationPage() {
    const [filter, setFilter] = useState({
        selectedCluster: DEFAULT_CLUSTER_OPTION,
        searchText: '',
    });

    const { data: argoApplicationsData, isLoading } = useQuery({
        queryKey: ['get-argo-applications', filter.selectedCluster.value],
        queryFn: async () => {
            const applications = await GetArgoApplications({
                selectedCluster: filter.selectedCluster,
            });
            return applications.data || {};
        },
    });

    const { clusterOptions, isClusterDataLoading } = useCluster({});

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

    const getSyncStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'synced':
                return 'green';
            case 'outofdate':
            case 'outofsynced':
                return 'orange';
            case 'failed':
                return 'red';
            default:
                return 'default';
        }
    };

    const getHealthStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'healthy':
                return 'green';
            case 'degraded':
                return 'red';
            case 'progressing':
                return 'blue';
            case 'suspended':
                return 'orange';
            default:
                return 'default';
        }
    };

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
            dataIndex: ['spec', 'project'],
            key: 'project',
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
            title: 'Repository',
            dataIndex: ['spec', 'source', 'repoURL'],
            key: 'repository',
            render: (repo) => (
                <Tooltip title={repo}>
                    <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {repo}
                    </div>
                </Tooltip>
            ),
        },
        {
            title: 'Age',
            dataIndex: ['metadata', 'creationTimestamp'],
            key: 'created',
            render: (timestamp) => calculateDuration(timestamp),
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, r) => (
                <Space.Compact>
                    <Button
                        size={'small'}
                        type="link"
                        onClick={() => {}}
                    >
                        {i18nInstance.t('607e7a4f377fa66b0b28ce318aab841f', '查看')}
                    </Button>
                    <Button
                        size={'small'}
                        type="link"
                        onClick={() => {}}
                    >
                        {i18nInstance.t('95b351c86267f3aedf89520959bce689', '编辑')}
                    </Button>

                    <Popconfirm
                        placement="topRight"
                        title={`Do you want to delete "${r.metadata?.name}" application?`}
                        onConfirm={async () => {
                            // todo after delete, need to wait until resource deleted

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
                        value={filter.selectedCluster}
                        style={{ width: 200 }}
                        onChange={(value) => setFilter({ ...filter, selectedCluster: value })}
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

            </div>
            <Table
                columns={columns}
                dataSource={filteredApplications}
                rowKey={(record) => `${record?.metadata?.name}-${record?.metadata?.namespace}-${record?.metadata?.labels?.cluster}`}
                loading={isLoading}
            />
        </Panel>
    );
}