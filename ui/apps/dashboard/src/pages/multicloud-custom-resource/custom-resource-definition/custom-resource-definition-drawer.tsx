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

import React from 'react';
import { Drawer, Space, Descriptions, Tabs, Empty, Spin, Table, Typography, Alert, Tag, Collapse } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { GetCustomResourceDefinitionByName } from '@/services';
import TagList, { convertLabelToTags } from '@/components/tag-list';
import { ColumnsType } from 'antd/es/table';

interface CustomResourceDefinitionDrawerProps {
    open: boolean;
    onClose: () => void;
    crdName: string;
    clusterName: string;
}

const { Panel } = Collapse;

const CustomResourceDefinitionDrawer: React.FC<CustomResourceDefinitionDrawerProps> = ({
    open,
    onClose,
    crdName,
    clusterName,
}) => {
    const { data, isLoading, error } = useQuery({
        queryKey: ['get-crd-details', clusterName, crdName],
        queryFn: async () => {
            const response = await GetCustomResourceDefinitionByName({
                cluster: clusterName,
                crdName: crdName,
            });
            return response.data?.crd;
        },
        enabled: open && !!crdName && !!clusterName,
    });

    // Function to render schema properties in a readable format
    const renderSchemaProperties = (properties: any) => {
        if (!properties) return <Typography.Text>No properties defined</Typography.Text>;

        const columns: ColumnsType<any> = [
            {
                title: 'Property',
                dataIndex: 'name',
                key: 'name',
                width: '30%',
            },
            {
                title: 'Type',
                dataIndex: 'type',
                key: 'type',
                width: '20%',
                render: (type) => <Tag color="blue">{type}</Tag>,
            },
            {
                title: 'Description',
                dataIndex: 'description',
                key: 'description',
                width: '50%',
            },
        ];

        const dataSource = Object.entries(properties).map(([name, property]: [string, any]) => ({
            key: name,
            name,
            type: property.type || 'object',
            description: property.description || '-',
            property,
        }));

        return (
            <Table
                columns={columns}
                dataSource={dataSource}
                pagination={false}
                expandable={{
                    expandedRowRender: (record) => {
                        const { property } = record;
                        if (property.properties) {
                            return (
                                <div style={{ padding: '20px' }}>
                                    <Typography.Title level={5}>Nested Properties</Typography.Title>
                                    {renderSchemaProperties(property.properties)}
                                </div>
                            );
                        }
                        if (property.items && property.items.properties) {
                            return (
                                <div style={{ padding: '20px' }}>
                                    <Typography.Title level={5}>Array Item Properties</Typography.Title>
                                    {renderSchemaProperties(property.items.properties)}
                                </div>
                            );
                        }
                        return <Typography.Text>No nested properties</Typography.Text>;
                    },
                    rowExpandable: (record) => 
                        !!record.property.properties || 
                        !!(record.property.items && record.property.items.properties),
                }}
            />
        );
    };

    // Function to render version information
    const renderVersions = (versions: any[]) => {
        if (!versions || !versions.length) return <Typography.Text>No versions available</Typography.Text>;

        const columns: ColumnsType<any> = [
            {
                title: 'Name',
                dataIndex: 'name',
                key: 'name',
            },
            {
                title: 'Served',
                dataIndex: 'served',
                key: 'served',
                render: (served) => served ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>,
            },
            {
                title: 'Storage',
                dataIndex: 'storage',
                key: 'storage',
                render: (storage) => storage ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>,
            },
            {
                title: 'Status',
                dataIndex: 'deprecated',
                key: 'deprecated',
                render: (deprecated) => deprecated ? <Tag color="red">Deprecated</Tag> : <Tag color="green">Active</Tag>,
            },
            {
                title: 'Warning',
                dataIndex: 'deprecationWarning',
                key: 'deprecationWarning',
                render: (deprecationWarning) => deprecationWarning || '-',
            }
        ];

        return (
            <Table
                columns={columns}
                dataSource={versions}
                pagination={false}
                rowKey="name"
            />
        );
    };

    // Helper to extract schema from CRD spec
    const getSchema = () => {
        if (!data || !data.spec || !data.spec.versions) return null;
        
        // Find the stored version
        const storedVersion = data.spec.versions.find((v: any) => v.storage) || data.spec.versions[0];
        
        if (!storedVersion || !storedVersion.schema || !storedVersion.schema.openAPIV3Schema) {
            return null;
        }
        
        return storedVersion.schema.openAPIV3Schema;
    };

    const schema = getSchema();

    // Render basic content when data is loaded
    const renderContent = () => {
        if (isLoading) return <Spin size="large" />;
        if (error) return <Alert type="error" message="Failed to load CRD details" />;
        if (!data) return <Empty description="No CRD information available" />;

        const tabItems = [
            {
                key: 'versions',
                label: 'Versions',
                children: renderVersions(data.spec?.versions || [])
            },
            {
                key: 'schema',
                label: 'Schema',
                children: schema ? (
                    <Collapse defaultActiveKey={['properties']}>
                        <Panel header="Properties" key="properties">
                            {renderSchemaProperties(schema.properties)}
                        </Panel>
                        <Panel header="Required Fields" key="required">
                            {schema.required && schema.required.length > 0 ? (
                                <Space size={[0, 8]} wrap>
                                    {schema.required.map((field: string) => (
                                        <Tag color="orange" key={field}>
                                            {field}
                                        </Tag>
                                    ))}
                                </Space>
                            ) : (
                                <Typography.Text>No required fields</Typography.Text>
                            )}
                        </Panel>
                    </Collapse>
                ) : (
                    <Empty description="No schema information available" />
                )
            },
            {
                key: 'yaml',
                label: 'YAML',
                children: (
                    <pre
                        style={{
                            backgroundColor: '#f5f5f5',
                            padding: '16px',
                            borderRadius: '4px',
                            overflow: 'auto',
                            maxHeight: '500px',
                        }}
                    >
                        {JSON.stringify(data, null, 2)}
                    </pre>
                )
            }
        ];

        return (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Descriptions title="Basic Information" bordered>
                    <Descriptions.Item label="Name" span={3}>
                        {data.metadata?.name || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Group" span={3}>
                        {data.spec?.group || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Kind" span={3}>
                        {(data.spec?.names && data.spec.names.kind) || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Scope" span={3}>
                        {data.spec?.scope || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Cluster" span={3}>
                        {clusterName || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Labels" span={3}>
                        <TagList tags={convertLabelToTags(data.metadata?.name || '', data.metadata?.labels)} />
                    </Descriptions.Item>
                    <Descriptions.Item label="Annotations" span={3}>
                        <TagList tags={convertLabelToTags('', data.metadata?.annotations)} />
                    </Descriptions.Item>
                </Descriptions>

                <Tabs defaultActiveKey="versions" items={tabItems} />
            </Space>
        );
    };

    return (
        <Drawer
            title={`Custom Resource Definition: ${crdName}`}
            placement="right"
            width={1000}
            onClose={onClose}
            open={open}
        >
            {renderContent()}
        </Drawer>
    );
};

export default CustomResourceDefinitionDrawer;
