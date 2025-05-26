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

import React, { useState } from 'react';
import { useTheme } from '@/contexts/theme-context';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    Tabs,
    Card,
    Typography,
    Button,
    Space,
    Tag,
    Badge,
    Flex,
    Breadcrumb,
    message,
    Spin,
    Empty,
    List,
    Divider,
} from 'antd';
import {
    EditOutlined,
    FileOutlined,
    FolderOutlined,
    EyeOutlined,
    RollbackOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import {
    GetPackageRev,
    GetPackageRevisionResources,
    PackageRevisionLifecycle,
} from '@/services/package';
import Panel from '@/components/panel';
import { calculateDuration } from '@/utils/time';
import TextareaWithUpload from '@/components/textarea-with-upload';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

// Interface for resource items displayed in the UI
interface ResourceItem {
    name: string;
    path: string;
    type: string;
    content: string;
    yaml?: string;
}

const PackageDetailsPage: React.FC = () => {
    const { packageName } = useParams<{ packageName: string }>();
    const [messageApi, contextHolder] = message.useMessage();
    const [editMode, setEditMode] = useState(false);
    const navigate = useNavigate();
    const [selectedResource, setSelectedResource] = useState<ResourceItem | null>(null);
    const [activeTab, setActiveTab] = useState<string>('overview');
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Fetch package revision details
    const {
        data: packageRev,
        isLoading: packageLoading,
        error: packageError,
    } = useQuery({
        queryKey: ['GetPackageRev', packageName],
        queryFn: async () => {
            try {
                if (!packageName) return null;
                const data = await GetPackageRev(packageName);
                return data;
            } catch (error) {
                messageApi.error(`Failed to fetch package revisions: ${error}`);
                return null;
            }
        },
    });

    // Fetch package revision resources
    const {
        data: packageResourcesResponse,
        isLoading: resourcesLoading,
        error: resourcesError,
    } = useQuery({
        queryKey: ['GetPackageRevisionResources', packageName],
        queryFn: async () => {
            if (!packageName) return null;
            try {
                const data = await GetPackageRevisionResources(packageName);
                return data;
            } catch (error) {
                messageApi.error(`Failed to fetch package resources: ${error}`);
                return null;
            }
        },
        enabled: !!packageName,
    });

    // Extract the actual resources data from the response
    const packageResources = packageResourcesResponse;
    // Transform resources data for display
    const resourceItems = React.useMemo(() => {
        if (!packageResources || !packageResources.spec || !packageResources.spec.resources) {
            return [];
        }

        const items: ResourceItem[] = [];
        const resources = packageResources.spec.resources;

        // Convert the resources object to an array of items
        Object.entries(resources).forEach(([path, content]) => {
            const name = path.split('/').pop() || path;
            const isYaml = name.endsWith('.yaml') || name.endsWith('.yml');
            const isKustomization = name === 'Kustomization' || name.toLowerCase().includes('kustomize');

            let type = 'file';
            if (isYaml) type = 'yaml';
            else if (isKustomization) type = 'kustomization';

            items.push({
                name,
                path,
                type,
                content,
                yaml: isYaml ? content : undefined,
            });
        });

        return items.sort((a, b) => a.path.localeCompare(b.path));
    }, [packageResources]);

    // Handle loading and error states
    if (packageLoading || resourcesLoading) {
        return (
            <Panel showSelectCluster={false}>
                <div className="flex items-center justify-center h-64">
                    <Spin size="large" tip="Loading package details..." />
                </div>
            </Panel>
        );
    }

    if (packageError || resourcesError) {
        return (
            <Panel showSelectCluster={false}>
                <div className="flex flex-col items-center justify-center h-64">
                    <Empty
                        description={
                            <span className="text-red-500">
                                Error loading package data. Package might not exist.
                            </span>
                        }
                    />
                    <Button type="primary" className="mt-4" onClick={() => navigate('/package-management')}>
                        Return to Package Management
                    </Button>
                </div>
            </Panel>
        );
    }

    // Get repository from package
    const repositoryName = packageRev?.spec?.repository || '';

    // Helper to render lifecycle badge
    const renderLifecycleBadge = (lifecycle: PackageRevisionLifecycle) => {
        if (lifecycle === PackageRevisionLifecycle.PUBLISHED) {
            return (
                <Badge
                    status="success"
                    text={
                        <Text type="success" strong>
                            Published
                        </Text>
                    }
                />
            );
        } else if (lifecycle === PackageRevisionLifecycle.PROPOSED) {
            return (
                <Badge
                    status="warning"
                    text={
                        <Text type="warning" strong>
                            Proposed
                        </Text>
                    }
                />
            );
        } else {
            return (
                <Badge
                    status="processing"
                    text={
                        <Text type="secondary" strong>
                            Draft
                        </Text>
                    }
                />
            );
        }
    };

    // Helper to render the resource content
    const renderResourceContent = (resource: ResourceItem) => {
        return (
            <TextareaWithUpload
                height="700px"
                hideUploadButton
                value={resource.content}
                onChange={(value) => {
                    console.log('value', value);
                }}
                checkContent={(data) => {
                    console.log('data', data);
                    return true;
                }}
                options={{
                    readOnly: !editMode,
                }}
            />
        );
    };

    return (
        <Spin spinning={!packageRev}>
            <Panel showSelectCluster={false}>
                {contextHolder}

                <Breadcrumb className="mb-4" items={[
                    { title: <Link to="/package-management">Package Management</Link> },
                    {
                        title: <Link to={`/package-management/repositories/${repositoryName}`}>{repositoryName}</Link>,
                        href: `/package-management/repositories/${repositoryName}`
                    },
                    { title: packageRev?.spec?.packageName },
                ]} />

                <Card className="mb-4">
                    <Flex justify="space-between" align="center">
                        <div>
                            <Title level={4}>{packageRev?.spec?.packageName}</Title>
                            <Text type="secondary">{packageRev?.metadata?.annotations?.['kpt.dev/description'] || 'No description'}</Text>
                        </div>
                        <Space>
                            <Button
                                icon={<RollbackOutlined />}
                                onClick={() => navigate(`/package-management/repositories/${repositoryName}`)}
                            >
                                Back to Repository
                            </Button>
                            {!editMode ? <Button
                                type="primary"
                                icon={<EditOutlined />}
                                onClick={() => setEditMode(true)}
                            >
                                Edit Package
                            </Button> : <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={() => setEditMode(false)}
                            >
                                Save
                            </Button>}
                        </Space>
                    </Flex>

                    <Flex className="mt-4" gap={16}>
                        <div>
                            <Text type="secondary">Repository:</Text>{' '}
                            <Link to={`/package-management/repositories/${repositoryName}`}>
                                <Typography.Link>{repositoryName}</Typography.Link>
                            </Link>
                        </div>
                        <div>
                            <Text type="secondary">Revision:</Text>{' '}
                            <Tag color="blue">{packageRev?.spec?.revision}</Tag>
                        </div>
                        <div>
                            <Text type="secondary">Lifecycle:</Text>{' '}
                            {renderLifecycleBadge(packageRev?.spec?.lifecycle as PackageRevisionLifecycle)}
                        </div>
                        <div>
                            <Text type="secondary">Created:</Text>{' '}
                            <Text>{calculateDuration(packageRev?.metadata?.creationTimestamp || '') + ' ago'}</Text>
                        </div>
                        <div>
                            <Text type="secondary">Updated:</Text>{' '}
                            <Text>{calculateDuration(packageRev?.status?.lastModifiedTime || packageRev?.metadata?.creationTimestamp || '') + ' ago'}</Text>
                        </div>
                    </Flex>
                </Card>

                <Tabs activeKey={activeTab} onChange={setActiveTab} className="mb-4">
                    <TabPane tab="Overview" key="overview" />
                    <TabPane tab="Resources" key="resources" />
                </Tabs>

                {activeTab === 'overview' && (
                    <Card>
                        <div className="mb-4">
                            <Title level={5}>Package Information</Title>
                            <Paragraph>
                                This package contains {resourceItems.length} resource files.
                            </Paragraph>

                            {packageRev?.metadata?.annotations?.['kpt.dev/package-path'] && (
                                <div className="mb-2">
                                    <Text strong>Package Path: </Text>
                                    <Tag>{packageRev?.metadata?.annotations?.['kpt.dev/package-path']}</Tag>
                                </div>
                            )}

                            {packageRev?.status?.workloadIdentity && (
                                <div className="mb-2">
                                    <Text strong>Workload Identity: </Text>
                                    <Tag>{packageRev?.status?.workloadIdentity}</Tag>
                                </div>
                            )}

                            {packageRev?.spec?.tasks && packageRev?.spec?.tasks.length > 0 && (
                                <div className="mb-2">
                                    <Text strong>Tasks: </Text>
                                    {packageRev?.spec?.tasks.map((task: any, index: number) => (
                                        <Tag key={index} color="blue">{task.type}</Tag>
                                    ))}
                                </div>
                            )}
                        </div>

                        <Divider />

                        <div>
                            <Title level={5}>Resource Files ({resourceItems.length})</Title>
                            <List
                                bordered
                                dataSource={resourceItems}
                                renderItem={(item) => (
                                    <List.Item
                                        actions={[
                                            <Button
                                                type="text"
                                                icon={<EyeOutlined />}
                                                onClick={() => {
                                                    setSelectedResource(item);
                                                    setActiveTab('resources');
                                                }}
                                            />
                                        ]}
                                    >
                                        <List.Item.Meta
                                            avatar={item.type === 'yaml' ? <FileOutlined /> : <FolderOutlined />}
                                            title={item.name}
                                            description={item.path}
                                        />
                                    </List.Item>
                                )}
                            />
                        </div>
                    </Card>
                )}

                {activeTab === 'resources' && (
                    <Card>
                        <Flex className="mb-4">
                            <div style={{ width: '20%' }} className="pr-4">
                                <Title level={5}>Resource Files</Title>
                                <List
                                    size="large"
                                    bordered
                                    dataSource={resourceItems}
                                    renderItem={(item) => (
                                        <List.Item
                                            className={selectedResource?.path === item.path ? (isDark ? 'bg-gray-800' : 'bg-blue-50') : ''}
                                            onClick={() => setSelectedResource(item)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <Space>
                                                {item.type === 'yaml' ? <FileOutlined /> : <FolderOutlined />}
                                                <Text ellipsis style={{ maxWidth: 180 }}>{item.name}</Text>
                                            </Space>
                                        </List.Item>
                                    )}
                                />
                            </div>

                            <div style={{ flex: 1 }} className="pl-4 border-l">
                                {selectedResource ? (
                                    <>
                                        <Flex justify="space-between" align="center" className="mb-4">
                                            <Title level={5}>{selectedResource.name}</Title>
                                            <Text type="secondary">{selectedResource.path}</Text>
                                        </Flex>
                                        {renderResourceContent(selectedResource)}
                                    </>
                                ) : (
                                    <div className="flex items-center justify-center h-64">
                                        <Empty description="Select a resource file to view its content" />
                                    </div>
                                )}
                            </div>
                        </Flex>
                    </Card>
                )}

            </Panel>
        </Spin>
    );
};

export default PackageDetailsPage;
