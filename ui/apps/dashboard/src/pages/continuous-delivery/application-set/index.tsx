import { useMemo, useState } from 'react';
import { Input, Select, Space, Table, Tag, Tooltip } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { SearchOutlined } from '@ant-design/icons';

import { ArgoApplicationSet, GetArgoApplicationSets } from '@/services/argocd';
import useCluster, { ClusterOption, DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import { calculateDuration } from '@/utils/time';
import Panel from '@/components/panel';

export default function ContinuousDeliveryApplicationSetPage() {
    const [filter, setFilter] = useState({
        selectedCluster: DEFAULT_CLUSTER_OPTION,
        searchText: '',
    });

    const { data: argoApplicationSetsData, isLoading } = useQuery({
        queryKey: ['get-argo-applicationsets', filter.selectedCluster.value],
        queryFn: async () => {
            const applicationSets = await GetArgoApplicationSets({
                selectedCluster: filter.selectedCluster,
            });
            return applicationSets.data || {};
        },
    });

    const { clusterOptions, isClusterDataLoading } = useCluster({});

    const filteredApplicationSets = useMemo(() => {
        if (!filter.searchText) {
            return argoApplicationSetsData?.items || [];
        }

        const searchLower = filter.searchText.toLowerCase();
        return (argoApplicationSetsData?.items || []).filter((appSet: ArgoApplicationSet) => {
            const name = appSet.metadata?.name?.toLowerCase() || '';
            return name.includes(searchLower);
        });
    }, [argoApplicationSetsData, filter.searchText]);

    // Helper function to extract and display generators
    const getGeneratorTypes = (appSet: ArgoApplicationSet): string[] => {
        if (!appSet.spec?.generators || appSet.spec.generators.length === 0) {
            return ['None'];
        }

        const types: string[] = [];
        appSet.spec.generators.forEach(generator => {
            if (generator.clusters) types.push('Clusters');
            if (generator.git) types.push('Git');
            if (generator.list) types.push('List');
            if (generator.clusterDecisionResource) types.push('ClusterDecision');
            // Add other generator types as needed
        });

        return types.length > 0 ? types : ['Custom'];
    };

    const columns: ColumnsType<ArgoApplicationSet> = [
        {
            title: 'Name',
            dataIndex: ['metadata', 'name'],
            key: 'name',
            render: (name) => <strong>{name}</strong>,
        },
        {
            title: 'Namespaces',
            dataIndex: ['spec', 'destinations', 'namespace'],
            key: 'namespaces',
        },
        {
            title: 'Cluster',
            dataIndex: ['metadata', 'labels', 'cluster'],
            key: 'cluster',
            render: (cluster) => <Tag>{cluster}</Tag>,
        },
        {
            title: 'Template Project',
            dataIndex: ['spec', 'template', 'spec', 'project'],
            key: 'project',
        },
        {
            title: 'Generator Types',
            key: 'generators',
            render: (_, record) => (
                <>
                    {getGeneratorTypes(record).map((type, index) => (
                        <Tag key={index} color="blue">{type}</Tag>
                    ))}
                </>
            ),
        },
        {
            title: 'Destination',
            key: 'destination',
            render: (_, record) => {
                const server = record.spec?.template?.spec?.destination?.server;
                const namespace = record.spec?.template?.spec?.destination?.namespace;

                if (!server && !namespace) return '-';

                return (
                    <Tooltip title={`${server}`}>
                        <Tag>{namespace || '*'} @ {server ? server.split('//')[1]?.split(':')[0] || server : 'unknown'}</Tag>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => {
                if (!record.status?.conditions) return <Tag>Unknown</Tag>;

                // Find error conditions first
                const errorCondition = record.status.conditions.find(c =>
                    c.type === 'ErrorOccurred' && c.status === 'True'
                );

                if (errorCondition) {
                    return (
                        <Tooltip title={errorCondition.message}>
                            <Tag color="red">Error</Tag>
                        </Tooltip>
                    );
                }

                // Then check for resources being ready
                const readyCondition = record.status.conditions.find(c =>
                    c.type === 'ResourcesUpToDate' && c.status === 'True'
                );

                if (readyCondition) {
                    return <Tag color="green">Healthy</Tag>;
                }

                return <Tag color="orange">Progressing</Tag>;
            },
        },
        {
            title: 'Created',
            dataIndex: ['metadata', 'creationTimestamp'],
            key: 'created',
            render: (timestamp) => calculateDuration(timestamp),
        },
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
                        placeholder="Search application sets..."
                        value={filter.searchText}
                        onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
                        prefix={<SearchOutlined />}
                        style={{ width: 250 }}
                    />
                </Space>
            </div>
            <Table
                columns={columns}
                dataSource={filteredApplicationSets}
                rowKey={(record) => `${record?.metadata?.name}-${record?.metadata?.namespace}-${record?.metadata?.labels?.cluster}`}
                loading={isLoading}
                pagination={{ pageSize: 10 }}
            />
        </Panel>
    );
}