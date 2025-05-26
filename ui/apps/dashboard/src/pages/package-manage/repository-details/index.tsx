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
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    Table,
    Card,
    Typography,
    Button,
    Space,
    Tag,
    Tooltip,
    Badge,
    Flex,
    Breadcrumb,
    message,
    Spin,
    Empty,
    TableColumnProps,
} from 'antd';
import {
    CheckCircleOutlined,
    InfoCircleOutlined,
    EditOutlined,
    DeleteOutlined,
    ExportOutlined,
    DownloadOutlined,
    PlusOutlined,
} from '@ant-design/icons';
import {
    GetPackageRevs,
    GetRepository,
    PackageRev,
    PackageRevisionLifecycle,
} from '@/services/package';
import Panel from '@/components/panel';
import AddPackage from '@/components/package-form/add-package';
import { calculateDuration } from '@/utils/time';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface PackageData {
    name: string;
    packagePath: string;
    revision: string;
    lifecycle: PackageRevisionLifecycle;
    workloadIdentity?: string;
    createdAt: string;
    updatedAt: string;
    raw: PackageRev; // Original package revision object
}

const RepositoryDetailsPage: React.FC = () => {
    const { repositoryName } = useParams<{ repositoryName: string }>();
    const [messageApi, contextHolder] = message.useMessage();
    const [addPackageModalVisible, setAddPackageModalVisible] = useState(false);

    // Fetch repository details
    const {
        data: repository,
        isLoading: repoLoading,
        error: repoError,
    } = useQuery({
        queryKey: ['GetRepository', repositoryName],
        queryFn: async () => {
            if (!repositoryName) return null;
            try {
                const { data } = await GetRepository(repositoryName);
                return data;
            } catch (error) {
                messageApi.error(`Failed to fetch repository: ${error}`);
                return null;
            }
        },
        enabled: !!repositoryName,
    });

    // Fetch all package revisions
    const {
        data: allPackageRevs,
        isLoading: packageRevsLoading,
        refetch: refetchPackages,
        error: packageRevsError,
    } = useQuery({
        queryKey: ['GetAllPackageRevs'],
        queryFn: async () => {
            try {
                const data = await GetPackageRevs();
                return data.items || [];
            } catch (error) {
                messageApi.error(`Failed to fetch package revisions: ${error}`);
                return [];
            }
        },
    });

    // Filter package revisions for this repository and only get the latest ones
    const repositoryPackages = React.useMemo(() => {
        console.log('allPackageRevs', allPackageRevs)
        if (!allPackageRevs || !repositoryName) return [];

        // Filter packages that belong to this repository and have the latest-revision label
        const filteredPackages = allPackageRevs.filter(
            (rev) =>
                rev.spec.repository === repositoryName &&
                (rev.spec.lifecycle !== PackageRevisionLifecycle.PUBLISHED || (rev.spec.lifecycle === PackageRevisionLifecycle.PUBLISHED && rev.metadata.labels?.['kpt.dev/latest-revision'] === 'true'))
        );

        // Transform to a more convenient format for display
        return filteredPackages.map((rev): PackageData => ({
            name: rev.spec.packageName || '',
            packagePath: rev.metadata.annotations?.['kpt.dev/package-path'] || '',
            revision: rev.spec.revision || '',
            lifecycle: rev.spec.lifecycle as PackageRevisionLifecycle,
            workloadIdentity: rev.status?.workloadIdentity,
            createdAt: rev.metadata.creationTimestamp || '',
            updatedAt: rev.status?.lastModifiedTime || rev.metadata.creationTimestamp || '',
            raw: rev,
        }));
    }, [allPackageRevs, repositoryName]);

    // Define table columns
    const columns: TableColumnProps<PackageData>[] = [
        {
            title: 'Package Name',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record: PackageData) => (
                <Link to={`/package-management/packages/${record.raw.metadata.name}`}>
                    <Typography.Link>{name}</Typography.Link>
                </Link>
            ),
            sorter: (a: PackageData, b: PackageData) => a.name.localeCompare(b.name),
        },
        {
            title: 'Blueprint',
            dataIndex: ['raw', 'status', 'upstreamLock', 'git', 'ref'],
            key: 'blueprint',
            render: (ref: string) => {
                return <Tag>{ref}</Tag>;
            },
        },
        {
            title: 'Revision',
            dataIndex: 'revision',
            key: 'revision',
            render: (revision: string) => <Tag color="blue">{revision}</Tag>,
        },
        {
            title: 'Lifecycle',
            dataIndex: 'lifecycle',
            key: 'lifecycle',
            width: 150,
            filters: [
                { text: 'Published', value: PackageRevisionLifecycle.PUBLISHED },
                { text: 'Proposed', value: PackageRevisionLifecycle.PROPOSED },
                { text: 'Draft', value: PackageRevisionLifecycle.DRAFT },
            ],
            onFilter: (value: React.Key | boolean, record: PackageData) => record.lifecycle === value,
            render: (lifecycle: PackageRevisionLifecycle) => {
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
            },
        },
        {
            title: 'Created',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => <Tooltip title={dayjs(date)?.format('YYYY-MM-DD HH:mm:ss')}>{calculateDuration(date)} ago</Tooltip>,
            sorter: (a: PackageData, b: PackageData) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        },
        {
            title: 'Updated',
            dataIndex: 'updatedAt',
            key: 'updatedAt',
            render: (date: string) => <Tooltip title={dayjs(date)?.format('YYYY-MM-DD HH:mm:ss')}>{calculateDuration(date)} ago</Tooltip>,
            defaultSortOrder: 'descend',
            sorter: (a: PackageData, b: PackageData) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: PackageData) => (
                <Space>
                    <Tooltip title="Edit Package">
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => {
                                // Handle edit
                                messageApi.info(`Edit package ${record.name} (not implemented)`);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Delete Package">
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => {
                                // Handle delete
                                messageApi.info(`Delete package ${record.name} (not implemented)`);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Export Package">
                        <Button
                            type="text"
                            icon={<ExportOutlined />}
                            onClick={() => {
                                // Handle export
                                messageApi.info(`Export package ${record.name} (not implemented)`);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Download Package">
                        <Button
                            type="text"
                            icon={<DownloadOutlined />}
                            onClick={() => {
                                // Handle download
                                messageApi.info(`Download package ${record.name} (not implemented)`);
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];


    if (repoError || packageRevsError) {
        return (
            <Panel>
                <div className="flex flex-col items-center justify-center h-64">
                    <Empty
                        description={
                            <span className="text-red-500">
                                Error loading repository data. Repository might not exist.
                            </span>
                        }
                    />
                    <Button type="primary" className="mt-4">
                        <Link to="/package-management">Return to Package Management</Link>
                    </Button>
                </div>
            </Panel>
        );
    }

    // Render repository details and package table
    return (
        <Spin spinning={repoLoading || packageRevsLoading || !repository}>

            <Panel showSelectCluster={false}>
                {contextHolder}

                <Breadcrumb className="mb-4" items={[
                    { title: <Link to="/package-management">Package Management</Link> },
                    { title: repositoryName },
                ]} />

                <Card className="mb-4">
                    <Flex justify="space-between" align="center">
                        <div>
                            <Title level={4}>{repository?.metadata.name}</Title>
                            <Text type="secondary">{repository?.spec.description || 'No description'}</Text>
                        </div>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setAddPackageModalVisible(true)}
                        >
                            Add Package
                        </Button>
                    </Flex>

                    <Flex className="mt-4" gap={16}>
                        <div>
                            <Text type="secondary">Type:</Text>{' '}
                            <Tag color="blue">{repository?.spec.type}</Tag>
                        </div>
                        {repository?.spec.git && (
                            <>
                                <div>
                                    <Text type="secondary">Repository:</Text>{' '}
                                    <Typography.Link href={repository.spec.git.repo} target="_blank">
                                        {repository.spec.git.repo}
                                    </Typography.Link>
                                </div>
                                {repository.spec.git.branch && (
                                    <div>
                                        <Text type="secondary">Branch:</Text>{' '}
                                        <Tag color="orange">{repository.spec.git.branch}</Tag>
                                    </div>
                                )}
                            </>
                        )}
                        {repository?.spec.oci && (
                            <div>
                                <Text type="secondary">Registry:</Text>{' '}
                                <Typography.Link href={repository.spec.oci.registry} target="_blank">
                                    {repository.spec.oci.registry}
                                </Typography.Link>
                            </div>
                        )}
                    </Flex>
                </Card>

                <Card
                    title={
                        <Flex justify="space-between" align="center">
                            <Title level={5}>Packages ({repositoryPackages.length})</Title>
                            <Space>
                                <Text type="secondary">
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} />{' '}
                                    Published:{' '}
                                    {repositoryPackages.filter(p => p.lifecycle === PackageRevisionLifecycle.PUBLISHED).length}
                                </Text>
                                <Text type="secondary">
                                    <InfoCircleOutlined style={{ color: '#1890ff' }} />{' '}
                                    Draft:{' '}
                                    {repositoryPackages.filter(p => p.lifecycle === PackageRevisionLifecycle.DRAFT).length}
                                </Text>
                            </Space>
                        </Flex>
                    }
                >
                    <Table
                        dataSource={repositoryPackages}
                        columns={columns}
                        rowKey="name"
                        pagination={{ pageSize: 20 }}
                    />
                </Card>

                {/* Add Package Modal */}
                {repository && (
                    <AddPackage
                        groupName="Repository"
                        repository={repository}
                        isModal={true}
                        isOpen={addPackageModalVisible}
                        size="large"
                        onClose={() => setAddPackageModalVisible(false)}
                        onSuccess={() => {
                            setAddPackageModalVisible(false);
                            refetchPackages();
                            messageApi.success('Package added successfully');
                        }}
                    />
                )}
            </Panel>
        </Spin>
    );
};

export default RepositoryDetailsPage;
