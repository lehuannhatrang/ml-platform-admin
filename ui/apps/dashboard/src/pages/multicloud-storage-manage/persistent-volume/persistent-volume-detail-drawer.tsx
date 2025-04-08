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

import { Card, Descriptions, Drawer, Tag, Flex } from 'antd';
import { GetPersistentVolumeDetail } from '@/services/persistentvolume';
import { useQuery } from '@tanstack/react-query';
import { calculateDuration } from '@/utils/time';
import { getStatusTagColor } from '@/utils/resource';
import TagList from '@/components/tag-list';

export interface PersistentVolumeDetailDrawerProps {
    open: boolean;
    onClose: () => void;
    namespace: string;
    name: string;
    cluster: string;
}

const PersistentVolumeDetailDrawer = ({
    open,
    onClose,
    namespace,
    name,
    cluster,
}: PersistentVolumeDetailDrawerProps) => {
    const { data: pvDetail, isLoading } = useQuery({
        queryKey: ['GetPersistentVolumeDetail', cluster, namespace, name],
        queryFn: async () => {
            if (!open) return null;
            try {
                const result = await GetPersistentVolumeDetail(cluster, namespace, name);
                return result.data?.data;
            } catch (error) {
                console.error('Failed to fetch persistent volume detail:', error);
                return null;
            }
        },
        enabled: open && !!cluster && !!name,
        refetchInterval: 5000,
    });

    return (
        <Drawer
            title={`Persistent Volume: ${name}`}
            placement="right"
            onClose={onClose}
            open={open}
            width={800}
            styles={{
                body: {
                    paddingBottom: 80,
                },
            }}
            loading={isLoading}
        >
            {pvDetail &&
                <Flex vertical gap="middle">
                    <Card title="Basic Information" bordered={false}>
                        <Descriptions column={2}>
                            <Descriptions.Item label="Name">{pvDetail.objectMeta.name}</Descriptions.Item>
                            <Descriptions.Item label="Status">
                                <Tag color={getStatusTagColor(pvDetail.status.phase)}>
                                    {pvDetail.status.phase}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Capacity">{pvDetail.spec.capacity?.storage || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Storage Class">{pvDetail.spec.storageClassName || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Reclaim Policy">{pvDetail.spec.persistentVolumeReclaimPolicy || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Volume Mode">{pvDetail.spec.volumeMode || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Access Modes">
                                <TagList
                                    tags={(pvDetail.spec.accessModes || []).map(mode => ({
                                        key: mode,
                                        value: mode,
                                    }))}
                                />
                            </Descriptions.Item>
                            <Descriptions.Item label="Age">{calculateDuration(pvDetail.objectMeta.creationTimestamp)}</Descriptions.Item>
                        </Descriptions>
                    </Card>

                    {pvDetail.spec.claimRef && (
                        <Card title="Claim Reference" bordered={false}>
                            <Descriptions column={2}>
                                <Descriptions.Item label="Kind">{pvDetail.spec.claimRef.kind}</Descriptions.Item>
                                <Descriptions.Item label="Name">{pvDetail.spec.claimRef.name}</Descriptions.Item>
                                <Descriptions.Item label="Namespace">{pvDetail.spec.claimRef.namespace}</Descriptions.Item>
                                <Descriptions.Item label="UID">{pvDetail.spec.claimRef.uid}</Descriptions.Item>
                            </Descriptions>
                        </Card>
                    )}

                    <Card title="Labels & Annotations" bordered={false}>
                        <Descriptions column={1}>
                            <Descriptions.Item label="Labels">
                                {Object.keys(pvDetail.objectMeta.labels || {}).length > 0 ? (
                                    <TagList
                                        tags={Object.entries(pvDetail.objectMeta.labels || {}).map(([key, value]) => ({
                                            key,
                                            value: `${key}: ${value}`,
                                        }))}
                                    />
                                ) : (
                                    '-'
                                )}
                            </Descriptions.Item>
                            <Descriptions.Item label="Annotations">
                                {Object.keys(pvDetail.objectMeta.annotations || {}).length > 0 ? (
                                    <TagList
                                        tags={Object.entries(pvDetail.objectMeta.annotations || {}).map(([key, value]) => ({
                                            key,
                                            value: `${key}: ${value}`,
                                        }))}
                                    />
                                ) : (
                                    '-'
                                )}
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>
                </Flex>
            }
        </Drawer>
    );
};

export default PersistentVolumeDetailDrawer;
