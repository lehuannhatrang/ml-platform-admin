import React from 'react';
import { Drawer, Space, Descriptions, Table, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { CustomResource, GetCustomResources } from '@/services';
import { calculateDuration } from '@/utils/time';
import TagList, { convertLabelToTags } from '@/components/tag-list';
import { ColumnsType } from 'antd/es/table';

interface CustomResourceDrawerProps {
    open: boolean;
    onClose: () => void;
    cluster: string;
    group: string;
    crd: string;
}

const CustomResourceDrawer: React.FC<CustomResourceDrawerProps> = ({
    open,
    onClose,
    cluster,
    group,
    crd,
}) => {
    const { data: resourceData, isLoading } = useQuery({
        queryKey: ['get-custom-resources', cluster, group, crd],
        queryFn: async () => {
            const response = await GetCustomResources({
                cluster,
                group,
                crd,
            });
            return response.data;
        },
        enabled: open,
    });

    const columns: ColumnsType<CustomResource> = [
        {
            title: 'Name',
            dataIndex: ['metadata', 'name'],
            key: 'name',
        },
        {
            title: 'Namespace',
            dataIndex: ['metadata', 'namespace'],
            key: 'namespace',
        },
        {
            title: 'Age',
            dataIndex: ['metadata', 'creationTimestamp'],
            key: 'age',
            render: (timestamp: string) => calculateDuration(timestamp),
        },
    ];

    const expandedRowRender = (record: CustomResource) => (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Descriptions title="Labels & Annotations" column={1} bordered>
                <Descriptions.Item label="Labels" className='flex flex-wrap'>
                    <TagList
                        tags={convertLabelToTags(
                            record.metadata.name || '',
                            record.metadata.labels,
                        )}
                    />
                </Descriptions.Item>
                <Descriptions.Item label="Annotations">
                    <TagList tags={convertLabelToTags('',record.metadata.annotations)} />
                </Descriptions.Item>
            </Descriptions>
            <Descriptions title="Details" column={1} bordered>
                <Descriptions.Item label="Spec">
                    <pre>{JSON.stringify(record.spec, null, 2)}</pre>
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                    <pre>{JSON.stringify(record.status, null, 2)}</pre>
                </Descriptions.Item>
            </Descriptions>
        </Space>
    )

    return (
        <Drawer
            title={`Custom Resources - ${crd}`}
            placement="right"
            width={1200}
            onClose={onClose}
            open={open}
            loading={isLoading}
        >
            {
                resourceData?.items && resourceData.items.length > 0 ? (
                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                        <Table
                            columns={columns}
                            dataSource={resourceData.items}
                            rowKey={(record) => record.metadata.uid}
                            expandable={{
                                expandedRowRender,
                                expandRowByClick: true,
                            }}
                        />
                    </Space>
                ) : (
                    <Empty description="No custom resources found" />
                )}
        </Drawer>
    );
};

export default CustomResourceDrawer;
