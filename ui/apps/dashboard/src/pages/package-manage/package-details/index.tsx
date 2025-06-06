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
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
    Alert,
    Table,
} from 'antd';
import {
    EditOutlined,
    FileOutlined,
    RollbackOutlined,
    SaveOutlined,
    CloseOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import Panel from '@/components/panel';
import { calculateDuration } from '@/utils/time';
import TextareaWithUpload from '@/components/textarea-with-upload';
import { PackageRevisionResources, PackageRevisionLifecycle, GetPackageRev, GetPackageRevs, GetPackageRevisionResources, UpdatePackageRevisionResources, UpdatePackageRev, ApprovePackageRev } from '../../../services/package-revision';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

// Interface for resource items displayed in the UI
interface ResourceItem {
    name: string;
    path: string;
    type: string;
    content: string;
    yaml?: string;
    kind?: string; // Kubernetes resource kind (Deployment, Service, etc.)
}

const PackageDetailsPage: React.FC = () => {
    const { packageName } = useParams<{ packageName: string }>();
    const [messageApi, contextHolder] = message.useMessage();
    const [editMode, setEditMode] = useState(false);
    const navigate = useNavigate();
    const [selectedResource, setSelectedResource] = useState<ResourceItem | null>(null);
    const [activeTab, setActiveTab] = useState<string>('resources');
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [lifecycleUpdating, setLifecycleUpdating] = useState(false);
    const queryClient = useQueryClient();

    // Track edited content for resources
    const [editedContent, setEditedContent] = useState<Record<string, string>>({});

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
        data: packageResources,
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

    // Function to update package lifecycle
    const updatePackageLifecycle = async (newLifecycle: PackageRevisionLifecycle) => {
        if (!packageName || !packageRev) return;

        try {
            setLifecycleUpdating(true);

            // For approval, use the specialized approval endpoint
            if (newLifecycle === PackageRevisionLifecycle.PUBLISHED) {
                const updatedPackage = {
                    ...packageRev,
                    spec: {
                        ...packageRev.spec,
                        lifecycle: newLifecycle
                    }
                };
                await ApprovePackageRev(packageName, updatedPackage);
                messageApi.success('Package has been approved');
            } else {
                // For other lifecycle changes (e.g., to PROPOSED), use the regular update
                const updatedPackage = {
                    ...packageRev,
                    spec: {
                        ...packageRev.spec,
                        lifecycle: newLifecycle
                    }
                };

                await UpdatePackageRev(packageName, updatedPackage);
                messageApi.success(`Package lifecycle updated to ${newLifecycle}`);
            }

            // Refetch the package data
            await queryClient.invalidateQueries({ queryKey: ['GetPackageRev', packageName] });
        } catch (error: any) {
            messageApi.error(`Failed to update package lifecycle: ${error.message || 'Unknown error'}`);
        } finally {
            setLifecycleUpdating(false);
        }
    };

    // Reset edited content when edit mode is toggled off
    React.useEffect(() => {
        if (!editMode) {
            setEditedContent({});
        }
    }, [editMode]);

    // Transform resources data for display
    const resourceItems = React.useMemo(() => {
        if (!packageResources || !packageResources.spec || !packageResources.spec.resources) {
            return [];
        }

        const items: ResourceItem[] = [];
        // If we have edited content and are in edit mode, use the edited content
        // otherwise use the original resources
        const resources = Object.keys(editedContent).length > 0 && editMode
            ? { ...packageResources.spec.resources, ...editedContent }
            : packageResources.spec.resources;

        // Convert the resources object to an array of items
        Object.entries(resources).forEach(([path, content]) => {
            const name = path.split('/').pop() || path;
            const isYaml = name.endsWith('.yaml') || name.endsWith('.yml');
            const isKustomization = name === 'Kustomization' || name.toLowerCase().includes('kustomize');

            let type = 'file';
            if (isYaml) type = 'yaml';
            else if (isKustomization) type = 'kustomization';

            // Extract the kind from YAML content if possible
            let kind = undefined;
            try {
                // Use simple regex to extract kind field from YAML
                const kindMatch = content.match(/kind:\s*([\w]+)/i);
                if (kindMatch && kindMatch[1]) {
                    kind = kindMatch[1];
                }
            } catch (e) {
                // Silently fail, kind will remain undefined
            }

            items.push({
                name,
                path,
                type,
                content,
                yaml: isYaml ? content : undefined,
                kind,
            });
        });

        // Sort items with predefined order for specific kinds, then alphabetically for the rest
        return items.sort((a, b) => {
            // Define priority order for specific kinds
            const kindOrder = [
                'Kptfile',
                'StarlarkRun',
                'ConfigMap',
                'Cluster',
                'KubeadmControlPlane',
                'WorkloadCluster',
                'KubeadmConfigTemplate',
                'PackageVariant'
            ];
            
            const kindA = a.kind || 'Unknown';
            const kindB = b.kind || 'Unknown';
            
            // Get indexes for sorting (if not in the priority list, use a high number)
            const indexA = kindOrder.indexOf(kindA);
            const indexB = kindOrder.indexOf(kindB);
            const priorityA = indexA === -1 ? 999 : indexA;
            const priorityB = indexB === -1 ? 999 : indexB;
            
            // Sort by priority first
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            
            // If kinds have the same priority (including when both aren't in priority list),
            // sort by path
            return a.path.localeCompare(b.path);
        });
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

    // Handle content changes
    const handleContentChange = (path: string, content: string) => {
        // Only track changes when in edit mode
        if (editMode) {
            setEditedContent(prev => ({
                ...prev,
                [path]: content
            }));
        }
    };

    // Handle cancel button click
    const handleCancel = () => {
        // Reset edited content
        setEditedContent({});
        // Exit edit mode
        setEditMode(false);

        // Show success message
        messageApi.success('Changes discarded');
    };

    // Handle save button click
    const handleSave = async () => {
        if (!packageName || !packageResources) {
            messageApi.error('Package data not available');
            return;
        }

        // No changes were made
        if (Object.keys(editedContent).length === 0) {
            setEditMode(false);
            return;
        }

        try {
            // Set loading state
            const saveLoading = messageApi.loading('Saving changes...');

            // Create updated resources by merging original with edited content
            const updatedResources = {
                ...packageResources.spec?.resources,
                ...editedContent
            };

            // Create the full payload with proper typing
            const updatedPackageResources: PackageRevisionResources = {
                apiVersion: packageResources.apiVersion,
                kind: packageResources.kind,
                metadata: packageResources.metadata,
                spec: {
                    packageName: packageResources.spec?.packageName || '',
                    repository: packageResources.spec?.repository || '',
                    revision: packageResources.spec?.revision || '',
                    workspaceName: packageResources.spec?.workspaceName,
                    resources: updatedResources
                },
                status: packageResources.status
            };

            // Send the update request
            if (packageName) {
                await UpdatePackageRevisionResources(packageName, updatedPackageResources);
            } else {
                throw new Error('Package name is required');
            }

            // Clear loading
            saveLoading();

            // Show success message
            messageApi.success('Package resources updated successfully');

            // Clear edited content
            setEditedContent({});

            // Exit edit mode
            setEditMode(false);

            // Refetch the package resources to get the latest data
            if (packageName) {
                await queryClient.invalidateQueries({ queryKey: ['GetPackageRevisionResources', packageName] as const });
            }
        } catch (error: any) {
            messageApi.error(`Failed to save changes: ${error.message || 'Unknown error'}`);
        }
    };

    // Helper to render the resource content
    const renderResourceContent = (resource: ResourceItem) => {
        // Get current content - use edited content if available
        const currentContent = editMode && editedContent[resource.path]
            ? editedContent[resource.path]
            : resource.content;

        return (
            <TextareaWithUpload
                height="700px"
                hideUploadButton
                value={currentContent}
                onChange={(value) => {
                    handleContentChange(resource.path, value || '');
                }}
                checkContent={(_data) => {
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
                        </div>
                        <Space>
                            <Button
                                icon={<RollbackOutlined />}
                                onClick={() => navigate(`/package-management/repositories/${repositoryName}`)}
                            >
                                Back to Repository
                            </Button>
                            {packageRev?.spec?.lifecycle === PackageRevisionLifecycle.DRAFT && (
                                <Button
                                    type="primary"
                                    loading={lifecycleUpdating}
                                    onClick={() => updatePackageLifecycle(PackageRevisionLifecycle.PROPOSED)}
                                >
                                    Propose
                                </Button>
                            )}
                            {packageRev?.spec?.lifecycle === PackageRevisionLifecycle.PROPOSED && (
                                <Button
                                    type="primary"
                                    loading={lifecycleUpdating}
                                    onClick={() => updatePackageLifecycle(PackageRevisionLifecycle.PUBLISHED)}
                                >
                                    Approve
                                </Button>
                            )}
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
                            <Tag color={theme === 'dark' ? 'yellow' : 'blue'}>{packageRev?.spec?.revision}</Tag>
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
                    {packageRev?.spec?.tasks && packageRev?.spec?.tasks.length > 0 && (
                        <div className="mt-4">
                            <Text strong>Tasks: </Text>
                            {packageRev?.spec?.tasks.map((task: any, index: number) => (
                                <Tag key={index} color="blue">{task.type}</Tag>
                            ))}
                        </div>
                    )}
                </Card>

                <Tabs activeKey={activeTab} onChange={setActiveTab} className="mb-4">
                    <TabPane tab="Resources" key="resources" />
                    <TabPane tab="Conditions" key="conditions" />
                    <TabPane tab="Revisions" key="revisions" />
                </Tabs>


                {activeTab === 'resources' && (
                    <Card
                        title={`Resource Files (${resourceItems.length})`}
                        extra={
                            (<Flex gap={8}>
                                {!editMode ? (
                                    packageRev?.spec?.lifecycle !== PackageRevisionLifecycle.PUBLISHED ? (
                                        <Button
                                            type="primary"
                                            icon={<EditOutlined />}
                                            onClick={() => setEditMode(true)}
                                        >
                                            Edit Package
                                        </Button>
                                    ) : null
                                ) : (
                                    <>
                                        <Button
                                            type="default"
                                            icon={<CloseOutlined />}
                                            onClick={handleCancel}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            onClick={handleSave}
                                        >
                                            Save
                                        </Button>
                                    </>
                                )
                                }
                            </Flex>)
                        }
                    >
                        <Flex className="mb-4">
                            <div style={{ width: '20%', maxHeight: 700, overflowY: 'auto' }} className="pr-4">
                                <div className="resource-list-container">
                                    {(() => {
                                        // Group items by kind
                                        const groupedItems = resourceItems.reduce((groups, item) => {
                                            const kind = item.kind || 'Other Resources';
                                            if (!groups[kind]) {
                                                groups[kind] = [];
                                            }
                                            groups[kind].push(item);
                                            return groups;
                                        }, {} as Record<string, ResourceItem[]>);

                                        // Convert groups to array and sort by kind
                                        return Object.entries(groupedItems).map(([kind, items]) => (
                                            <div key={kind} className="mb-4">
                                                <div className={`font-bold py-2 px-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`} style={{ borderRadius: '8px 8px 0 0' }}>
                                                    <Text strong>{kind}</Text>
                                                </div>
                                                <List
                                                    size="large"
                                                    bordered
                                                    dataSource={items}
                                                    style={{ borderRadius: '0 0 8px 8px' }}
                                                    renderItem={(item, index) => (
                                                        <List.Item
                                                            className={selectedResource?.path === item.path ? (isDark ? 'bg-gray-800' : 'bg-blue-50') : ''}
                                                            onClick={() => setSelectedResource(item)}
                                                            key={`${kind}-${index}`}
                                                            style={{ cursor: 'pointer', borderRadius: index === items.length - 1 ? '0 0 8px 8px' : 0 }}
                                                        >
                                                            <Space>
                                                                {item.type === 'yaml' ? <FileOutlined /> : <SettingOutlined />}
                                                                <Text ellipsis style={{ maxWidth: 180 }}>{item.name}</Text>
                                                            </Space>
                                                        </List.Item>
                                                    )}
                                                />
                                            </div>
                                        ));
                                    })()}
                                </div>
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

                {activeTab === 'revisions' && (
                    <Card>
                        <Title level={5}>Package Revision History</Title>
                        <RevisionHistory
                            packageName={packageRev?.spec?.packageName}
                            repository={repositoryName}
                            currentRevision={packageRev?.spec?.revision}
                        />
                    </Card>
                )}

                {activeTab === 'conditions' && (
                    <Card>
                        <Title level={5}>Package Revision Conditions</Title>
                        {packageRev?.status?.conditions && packageRev.status.conditions.length > 0 ? (
                            <List
                                bordered
                                dataSource={packageRev.status.conditions}
                                renderItem={(condition: any) => (
                                    <List.Item>
                                        <List.Item.Meta
                                            title={
                                                <Flex align="center" gap={8}>
                                                    <Text strong>{condition.type}</Text>
                                                    <Tag color={condition.status === 'True' ? 'success' : 'warning'}>
                                                        {condition.status}
                                                    </Tag>
                                                </Flex>
                                            }
                                            description={
                                                <>
                                                    <div>
                                                        <Text strong>Reason: </Text>
                                                        <Text>{condition.reason}</Text>
                                                    </div>
                                                    <div>
                                                        <Text strong>Message: </Text>
                                                        <Text>{condition.message}</Text>
                                                    </div>
                                                </>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty description="No conditions found for this package revision" />
                        )}
                    </Card>
                )}

            </Panel>
        </Spin>
    );
};

// Component to display revision history
const RevisionHistory: React.FC<{
    packageName?: string;
    repository?: string;
    currentRevision?: string;
}> = ({ packageName, repository, currentRevision }) => {
    // Fetch all package revisions
    const {
        data: packageRevisionsData,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['GetAllPackageRevs'],
        queryFn: async () => {
            try {
                const data = await GetPackageRevs();
                return data?.items || [];
            } catch (error) {
                throw new Error(`Failed to fetch package revisions: ${error}`);
            }
        },
        enabled: !!packageName && !!repository,
    });

    // Filter revisions by package name and repository
    const filteredRevisions = React.useMemo(() => {
        if (!packageRevisionsData || !packageName || !repository) {
            return [];
        }

        return packageRevisionsData
            .filter(rev =>
                rev.spec.packageName === packageName &&
                rev.spec.repository === repository
            )
            .sort((a, b) => {
                // Sort by creation timestamp (newest first)
                const dateA = a.metadata.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
                const dateB = b.metadata.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
                return dateB - dateA;
            });
    }, [packageRevisionsData, packageName, repository]);

    if (isLoading) {
        return <Spin tip="Loading revision history..." />;
    }

    if (error) {
        return <Alert type="error" message="Failed to load revision history" description={`${error}`} />;
    }

    if (!filteredRevisions.length) {
        return <Empty description="No revision history found" />;
    }

    return (
        <Table
            rowKey="name"
            dataSource={filteredRevisions.map(rev => ({
                ...rev,
                name: rev.metadata.name,
                created: rev.metadata.creationTimestamp,
                revision: rev.spec.revision || 'N/A',
                lifecycle: rev.spec.lifecycle
            }))}
            columns={[
                {
                    title: 'Revision',
                    dataIndex: 'revision',
                    key: 'revision',
                    render: (text: string) => (
                        <Flex align="center" gap={8}>
                            <Text strong>{text}</Text>
                            {text === currentRevision && (
                                <Tag color="processing">Current</Tag>
                            )}
                        </Flex>
                    )
                },
                {
                    title: 'Status',
                    dataIndex: 'lifecycle',
                    key: 'lifecycle',
                    render: (lifecycle: PackageRevisionLifecycle) => (
                        <Tag color={getLifecycleColor(lifecycle)}>
                            {lifecycle}
                        </Tag>
                    )
                },
                {
                    title: 'Created',
                    dataIndex: 'created',
                    key: 'created',
                    render: (text: string) => text ? new Date(text).toLocaleString() : 'N/A',
                    sorter: (a: any, b: any) => {
                        const dateA = a.created ? new Date(a.created).getTime() : 0;
                        const dateB = b.created ? new Date(b.created).getTime() : 0;
                        return dateA - dateB;
                    },
                    defaultSortOrder: 'descend'
                },
                {
                    title: 'Name',
                    dataIndex: 'name',
                    key: 'name'
                },
                {
                    title: 'Actions',
                    key: 'actions',
                    render: (_: any, record: any) => (
                        record.name !== packageName ? (
                            <Link to={`/package-management/packages/${record.name}`}>
                                View This Revision
                            </Link>
                        ) : (
                            <Text type="secondary">Current</Text>
                        )
                    )
                }
            ]}
            pagination={{ pageSize: 10 }}
        />
    );
};

// Helper function to get color for lifecycle badge
const getLifecycleColor = (lifecycle: PackageRevisionLifecycle): string => {
    switch (lifecycle) {
        case PackageRevisionLifecycle.PUBLISHED:
            return 'success';
        case PackageRevisionLifecycle.PROPOSED:
            return 'warning';
        default:
            return 'default';
    }
};

export default PackageDetailsPage;
