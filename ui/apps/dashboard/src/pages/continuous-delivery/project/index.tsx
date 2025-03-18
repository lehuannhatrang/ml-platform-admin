import { useMemo, useState } from 'react';
import { Input, Select, Space, Table, Button, Popconfirm } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';

import { ArgoProject, DeleteArgoProject, GetArgoProjects } from '../../../services/argocd';
import { useCluster } from '@/hooks';
import { calculateDuration } from '@/utils/time';
import Panel from '@/components/panel';
import { ClusterOption, DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import TagList from '@/components/tag-list';
import EditProjectModal from './edit-project-modal';
import i18nInstance from '@/utils/i18n';

export default function ContinuousDeliveryProjectPage() {
    const [filter, setFilter] = useState({
        selectedCluster: DEFAULT_CLUSTER_OPTION,
        searchText: '',
    });
    const [modalConfig, setModalConfig] = useState<{
        open: boolean;
        mode: 'create' | 'edit';
        selectedProject?: ArgoProject;
        cluster: string;
    }>({
        open: false,
        mode: 'create',
        cluster: '',
    });

    const { data: argoProjectsData, isLoading, refetch } = useQuery({
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

    const handleOpenModal = (mode: 'create' | 'edit', project?: ArgoProject) => {
        setModalConfig({
            open: true,
            mode,
            selectedProject: project,
            cluster: project?.metadata?.labels?.cluster || filter.selectedCluster.value,
        });
    };

    const handleCloseModal = () => {
        setModalConfig({
            ...modalConfig,
            open: false,
        });
    };

    const handleSuccess = () => {
        handleCloseModal();
        refetch();
    };

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
            title: 'Age',
            dataIndex: ['metadata', 'creationTimestamp'],
            key: 'created',
            render: (timestamp) => calculateDuration(timestamp),
            width: 120,
            defaultSortOrder: 'descend',
            sorter: (a, b) => new Date(a.metadata?.creationTimestamp).getTime() - new Date(b.metadata?.creationTimestamp).getTime(),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: ArgoProject) => (
                <Space.Compact>
                    <Button
                        onClick={() => handleOpenModal('edit', record)}
                        size={'small'}
                        type="link"
                    >
                        {i18nInstance.t('95b351c86267f3aedf89520959bce689', '编辑')}
                    </Button>

                    <Popconfirm
                        placement="topRight"
                        title={`Do you want to delete "${record.metadata?.name}" project?`}
                        onConfirm={async () => {
                            const response = await DeleteArgoProject(record.metadata?.labels?.cluster || filter.selectedCluster.value, record.metadata?.name);
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
                        placeholder="Search projects..."
                        value={filter.searchText}
                        onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
                        prefix={<SearchOutlined />}
                        style={{ width: 250 }}
                    />
                </Space>
                <Button 
                    type="primary" 
                    onClick={() => handleOpenModal('create')}
                    icon={<PlusOutlined />}
                >
                    Create Project
                </Button>
            </div>
            <Table
                columns={columns}
                dataSource={filteredProjects}
                rowKey={(record) => `${record?.metadata?.name}-${record?.metadata?.namespace}-${record?.metadata?.labels?.cluster}`}
                loading={isLoading}
                pagination={{ pageSize: 10 }}
            />
            
            <EditProjectModal
                mode={modalConfig.mode}
                open={modalConfig.open}
                project={modalConfig.selectedProject}
                onCancel={handleCloseModal}
                onSuccess={handleSuccess}
                cluster={modalConfig.cluster}
            />
        </Panel>
    );
}