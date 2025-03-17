import { useMemo, useState } from 'react';
import { Input, Select, Space, Table } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { SearchOutlined } from '@ant-design/icons';

import { ArgoProject, GetArgoProjects } from '../../../services/argocd';
import { useCluster } from '@/hooks';
import { calculateDuration } from '@/utils/time';
import Panel from '@/components/panel';
import { DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import TagList from '@/components/tag-list';


export default function ContinuousDeliveryProjectPage() {
    const [filter, setFilter] = useState({
        selectedCluster: DEFAULT_CLUSTER_OPTION,
        searchText: '',
    });

    const { data: argoProjectsData, isLoading } = useQuery({
        queryKey: ['get-argo-projects', filter.selectedCluster.value],
        queryFn: async () => {
            const projects = await GetArgoProjects({
                selectedCluster: filter.selectedCluster,
            });
            return projects.data || {};
        },
    });

    const { clusterOptions, isClusterDataLoading } = useCluster({});

    const filteredProjects = useMemo(() => {
        if (!filter.searchText) {
            return argoProjectsData?.items || [];
        }

        const searchLower = filter.searchText.toLowerCase();
        return (argoProjectsData?.items || []).filter((project: ArgoProject) => {
            const name = project.metadata?.name?.toLowerCase() || '';
            const description = project.spec?.description?.toLowerCase() || '';
            const namespace = project.metadata?.namespace?.toLowerCase() || '';
            const cluster = project.metadata?.labels?.cluster?.toLowerCase() || '';

            return name.includes(searchLower) ||
                description.includes(searchLower) ||
                namespace.includes(searchLower) ||
                cluster.includes(searchLower);
        });
    }, [argoProjectsData, filter.searchText]);

    const columns: ColumnsType<ArgoProject> = [
        {
            title: 'Name',
            dataIndex: ['metadata', 'name'],
            key: 'name',
        },
        ...(filter.selectedCluster.value === 'ALL' ? [{
            title: 'Cluster',
            key: 'cluster',
            filters: clusterOptions.filter(option => option.value !== 'ALL').map((i) => ({ text: i.label, value: i.label })),
            onFilter: (value: React.Key | boolean, record: ArgoProject) => record.metadata?.labels?.cluster === value,
            render: (_: any, r: ArgoProject) => {
                return r.metadata?.labels?.cluster || '-';
            },
        }] : []),
        {
            title: 'Description',
            dataIndex: ['spec', 'description'],
            key: 'description',
            render: (description) => description || '-',
        },
        {
            title: 'Source Repositories',
            dataIndex: ['spec', 'sourceRepos'],
            key: 'sourceRepos',
            render: (repos: string[]) => <TagList tags={repos.map(e => ({
                key: e,
                value: e,
            })) || []} />,
        },
        {
            title: 'Destinations',
            dataIndex: ['spec', 'destinations'],
            key: 'destinations',
            render: (destinations: { namespace: string; server: string }[]) => <TagList tags={destinations.map(e => ({
                key: `${e.namespace} @ ${e.server}`,
                value: `${e.namespace} @ ${e.server}`,
            })) || []} />,
        },
        {
            title: 'Age',
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
                        value={filter.selectedCluster}
                        style={{ width: 200 }}
                        onChange={(value) => setFilter({ ...filter, selectedCluster: value })}
                        options={clusterOptions}
                        loading={isClusterDataLoading}
                        placeholder="Select Cluster"
                    />
                    <Input
                        placeholder="Search projects..."
                        value={filter.searchText}
                        onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
                        prefix={<SearchOutlined />}
                        style={{ width: 250 }}
                    />
                </Space>
            </div>
            <Table
                columns={columns}
                dataSource={filteredProjects}
                rowKey={(record) => `${record?.metadata?.name}-${record?.metadata?.namespace}-${record?.metadata?.labels?.cluster}`}
                loading={isLoading}
                pagination={{ pageSize: 10 }}
            />
        </Panel>
    );
}