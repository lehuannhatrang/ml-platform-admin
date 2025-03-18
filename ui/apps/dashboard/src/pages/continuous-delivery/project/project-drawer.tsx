import { useEffect, useState } from 'react';
import { Drawer, Descriptions, Table, Space, Button, Typography, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ArgoApplication, ArgoProject, GetArgoProjectDetails } from '../../../services/argocd';
import { calculateDuration } from '@/utils/time';
import i18nInstance from '@/utils/i18n';
import { getSyncStatusColor, getHealthStatusColor } from '@/utils/argo';
import { useNavigate } from 'react-router-dom';

interface ProjectDrawerProps {
    open: boolean;
    onClose: () => void;
    project?: ArgoProject;
    clusterName: string;
}

const ProjectDrawer: React.FC<ProjectDrawerProps> = ({
    open,
    onClose,
    project,
    clusterName,
}) => {
    const [selectedProject, setSelectedProject] = useState<ArgoProject | undefined>(project);

    useEffect(() => {
        setSelectedProject(project);
    }, [project]);

    const navigate = useNavigate()

    const { data: projectDetails, isLoading } = useQuery({
        queryKey: ['argocd', 'project-details', clusterName, selectedProject?.metadata?.name],
        queryFn: async () => {
            if (!selectedProject?.metadata?.name) return null;
            const response = await GetArgoProjectDetails(clusterName, selectedProject.metadata.name);
            return response.data;
        },
        enabled: !!selectedProject?.metadata?.name && open,
    });

    const applicationColumns = [
        {
            title: i18nInstance.t('Name'),
            dataIndex: ['metadata', 'name'],
            key: 'name',
        },
        {
            title: 'Sync Status',
            dataIndex: ['status', 'sync', 'status'],
            key: 'syncStatus',
            render: (status: string) => (
                <Tag color={getSyncStatusColor(status || '')}>
                    {status || 'Unknown'}
                </Tag>
            ),
        },
        {
            title: 'Health Status',
            dataIndex: ['status', 'health', 'status'],
            key: 'healthStatus',
            render: (status: string) => (
                <Tag color={getHealthStatusColor(status || '')}>
                    {status || 'Unknown'}
                </Tag>
            ),
        },
        {
            title: 'Age',
            dataIndex: ['metadata', 'creationTimestamp'],
            key: 'created',
            render: (timestamp: string) => calculateDuration(timestamp),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: ArgoApplication) => (
                <Button
                    type="link"
                    onClick={() => {
                        navigate(`/continuous-delivery/application?action=view&name=${record.metadata?.name}&cluster=${clusterName}`);
                    }}
                >
                    {i18nInstance.t('View Details')}
                </Button>
            ),
        },
    ];

    return (
        <Drawer
            title={`${i18nInstance.t('Project')}: ${selectedProject?.metadata?.name}`}
            placement="right"
            width={800}
            onClose={onClose}
            open={open}
        >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Descriptions title={i18nInstance.t('Project Details')} bordered column={2}>
                    <Descriptions.Item label={i18nInstance.t('Name')}>
                        {selectedProject?.metadata?.name}
                    </Descriptions.Item>
                    <Descriptions.Item label={i18nInstance.t('Cluster')}>
                        {selectedProject?.metadata?.labels?.cluster || clusterName}
                    </Descriptions.Item>
                    <Descriptions.Item label={i18nInstance.t('Created')}>
                        {selectedProject?.metadata?.creationTimestamp && 
                            calculateDuration(selectedProject.metadata.creationTimestamp)
                        }
                    </Descriptions.Item>
                    <Descriptions.Item label={i18nInstance.t('Description')}>
                        {selectedProject?.spec?.description || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label={i18nInstance.t('Source Repos')} span={2}>
                        {selectedProject?.spec?.sourceRepos?.join(', ') || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label={i18nInstance.t('Destinations')} span={2}>
                        {selectedProject?.spec?.destinations?.map((dest: any) => (
                            <div key={`${dest.server}-${dest.namespace}`}>
                                {dest.server} / {dest.namespace}
                            </div>
                        )) || '-'}
                    </Descriptions.Item>
                </Descriptions>

                <Typography.Title level={4}>{i18nInstance.t('Applications')}</Typography.Title>
                <Table
                    columns={applicationColumns}
                    dataSource={projectDetails?.applications || []}
                    loading={isLoading}
                    rowKey={(record) => record.metadata?.name || ''}
                    pagination={false}
                />
            </Space>
        </Drawer>
    );
};

export default ProjectDrawer;
