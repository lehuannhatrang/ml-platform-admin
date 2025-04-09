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

import i18nInstance from '@/utils/i18n';
import Panel from '@/components/panel';

import {
    Button,
    Input,
    Select,
    Space,
    Table,
    TableColumnProps,
    Flex,
    Tag,
    App
} from 'antd';
import type { PersistentVolume } from '@/services/persistentvolume';
import { GetPersistentVolumes } from '@/services/persistentvolume';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import TagList from '@/components/tag-list';
import useNamespace from '@/hooks/use-namespace.ts';
import useCluster from '@/hooks/use-cluster';
import { calculateDuration } from '@/utils/time.ts';
import { getStatusTagColor } from '@/utils/resource.ts';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PersistentVolumeDetailDrawer, {
    PersistentVolumeDetailDrawerProps,
} from './persistent-volume-detail-drawer';
import PersistentVolumeEditorModal from './persistent-volume-editor-modal';
import { DeleteMemberResource, GetMemberResource } from '@/services/unstructured';
import { stringify } from 'yaml';
import { PlusOutlined } from '@ant-design/icons';

const PersistentVolumePage = () => {
    const [searchParams] = useSearchParams();
    const { message, modal } = App.useApp();

    const action = searchParams.get('action');
    const name = searchParams.get('name');
    const cluster = searchParams.get('cluster');
    const namespace = searchParams.get('namespace');

    const navigate = useNavigate();

    const { clusterOptions, selectedCluster } = useCluster({});

    const [filter, setFilter] = useState<{
        selectedNamespace: string;
        searchText: string;
    }>({
        selectedNamespace: '',
        searchText: '',
    });

    const { nsOptions, isNsDataLoading } = useNamespace({ clusterFilter: selectedCluster });

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['GetPersistentVolumes', JSON.stringify(filter), selectedCluster.value],
        queryFn: async () => {
            const result = await GetPersistentVolumes({
                namespace: filter.selectedNamespace,
                keyword: filter.searchText,
                cluster: selectedCluster,
            });
            return result.data || {};
        },
        refetchInterval: 5000,
    });

    const [drawerData, setDrawerData] = useState<
        Omit<PersistentVolumeDetailDrawerProps, 'onClose'>
    >({
        open: false,
        namespace: '',
        name: '',
        cluster: selectedCluster.label,
    });

    const [editorState, setEditorState] = useState<{
        mode: 'create' | 'edit';
        open: boolean;
        pvContent: string;
        cluster: string;
    }>({
        mode: 'create',
        open: false,
        pvContent: '',
        cluster: '',
    });

    useEffect(() => {
        if (action === 'view' && name && cluster && namespace) {
            const dataItems = data?.data?.persistentVolumes || [];
            const persistentVolume = dataItems?.find(pv =>
                pv.objectMeta.name === name &&
                pv.objectMeta.namespace === namespace &&
                pv.objectMeta.labels?.cluster === cluster
            );

            if (persistentVolume) {
                setDrawerData({
                    open: true,
                    namespace,
                    name,
                    cluster: selectedCluster.label,
                });
            }
        }
    }, [action, name, cluster, namespace, data]);

    const handleEdit = async (record: PersistentVolume) => {
        try {
            const pvName = record.objectMeta.name;
            const clusterName = record.objectMeta.labels?.cluster || selectedCluster.label;
            
            // Fetch the PV YAML using the cluster-scoped endpoint
            const response = await GetMemberResource({
                kind: 'PersistentVolume',
                name: pvName,
                cluster: clusterName
            });
            
            const pvContent = stringify(response.data);
            
            setEditorState({
                mode: 'edit',
                open: true,
                pvContent,
                cluster: clusterName
            });
        } catch (error) {
            console.error('Failed to fetch PV for editing:', error);
            message.error('Failed to load Persistent Volume data for editing');
        }
    };

    const handleDelete = (record: PersistentVolume) => {
        const pvName = record.objectMeta.name;
        const clusterName = record.objectMeta.labels?.cluster || selectedCluster.label;
        
        modal.confirm({
            title: 'Delete Persistent Volume',
            content: `Are you sure you want to delete PersistentVolume "${pvName}"?`,
            okText: 'Delete',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await DeleteMemberResource({
                        kind: 'PersistentVolume',
                        name: pvName,
                        cluster: clusterName
                    });
                    message.success(`PersistentVolume "${pvName}" deleted successfully`);
                    refetch();
                } catch (error) {
                    console.error('Failed to delete PV:', error);
                    message.error('Failed to delete Persistent Volume');
                }
            }
        });
    };

    const columns: TableColumnProps<PersistentVolume>[] = [
        {
            title: 'Volume Name',
            key: 'name',
            width: 250,
            dataIndex: ['objectMeta', 'name'],
        },
        ...(selectedCluster.value === 'ALL' ? [{
            title: 'Cluster',
            key: 'cluster',
            filters: clusterOptions.filter(option => option.value !== 'ALL').map((i) => ({ text: i.label, value: i.label })),
            onFilter: (value: React.Key | boolean, record: PersistentVolume) => record.objectMeta.labels?.cluster === value,
            width: 100,
            render: (_: any, record: PersistentVolume) => {
                return record.objectMeta.labels?.cluster || '-';
            },
        }] : []),
        {
            title: 'Capacity',
            key: 'capacity',
            width: 100,
            render: (_, record) => {
                return record.spec.capacity?.storage || '-';
            },
        },
        {
            title: 'Access Modes',
            key: 'accessModes',
            width: 150,
            render: (_, record) => {
                return (
                    <TagList
                        tags={(record.spec.accessModes || []).map(mode => ({
                            key: mode,
                            value: mode,
                        }))}
                    />
                );
            },
        },
        {
            title: 'Reclaim Policy',
            key: 'reclaimPolicy',
            width: 150,
            render: (_, record) => {
                return record.spec.persistentVolumeReclaimPolicy || '-';
            },
        },
        {
            title: 'Status',
            key: 'status',
            width: 100,
            render: (_, record) => {
                const phase = record.status.phase;
                return (
                    <Tag color={getStatusTagColor(phase)}>
                        {phase}
                    </Tag>
                );
            },
        },
        {
            title: 'Storage Class',
            key: 'storageClass',
            width: 150,
            render: (_, record) => {
                return record.spec.storageClassName || '-';
            },
        },
        {
            title: 'Age',
            key: 'age',
            width: 100,
            render: (_, record) => {
                return calculateDuration(record.objectMeta.creationTimestamp);
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 200,
            render: (_, record) => {
                return (
                    <Space>
                        <Button
                            type="link"
                            onClick={() => {
                                setDrawerData({
                                    open: true,
                                    namespace: record.objectMeta.namespace,
                                    name: record.objectMeta.name,
                                    cluster: record.objectMeta.labels?.cluster || selectedCluster.label,
                                });
                            }}
                        >
                            View
                        </Button>
                        <Button
                            type="link"
                            onClick={() => handleEdit(record)}
                        >
                            Edit
                        </Button>
                        <Button
                            type="link"
                            danger
                            onClick={() => handleDelete(record)}
                        >
                            Delete
                        </Button>
                    </Space>
                );
            },
        }
    ];

    return (
        <Panel>
            <Flex gap="middle" vertical>
                <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
                    <Space>
                        <span>
                            {i18nInstance.t('280c56077360c204e536eb770495bc5f', '命名空间')}
                        </span>
                        <Select
                            style={{ width: 200 }}
                            loading={isNsDataLoading}
                            options={nsOptions}
                            value={filter.selectedNamespace ? filter.selectedNamespace : undefined}
                            onChange={(selectedNamespace) => {
                                setFilter({
                                    ...filter,
                                    selectedNamespace: selectedNamespace as string,
                                });
                            }}
                            allowClear
                            placeholder={i18nInstance.t('namespace', 'Namespace')}
                        />
                        <Input.Search
                            style={{ width: 300 }}
                            placeholder={i18nInstance.t('search', 'Search')}
                            value={filter.searchText}
                            onChange={(e) => {
                                setFilter({
                                    ...filter,
                                    searchText: e.target.value,
                                });
                            }}
                            allowClear
                        />
                    </Space>
                    <Button 
                        type="primary"
                        onClick={() => {
                            setEditorState({
                                mode: 'create',
                                open: true,
                                pvContent: '',
                                cluster: selectedCluster.value !== 'ALL' ? selectedCluster.label : '',
                            });
                        }}
                        icon={<PlusOutlined />}
                    >
                        Add
                    </Button>
                </Space>

                <Table
                    rowKey={(record) => `${record.objectMeta.labels?.cluster || selectedCluster.value}-${record.objectMeta.namespace}-${record.objectMeta.uid}`}
                    columns={columns}
                    dataSource={(data?.data?.persistentVolumes || []) as PersistentVolume[]}
                    loading={isLoading}
                    scroll={{ x: 'max-content' }}
                />
            </Flex>

            <PersistentVolumeDetailDrawer
                {...drawerData}
                onClose={() => {
                    setDrawerData({
                        ...drawerData,
                        open: false,
                    });
                    navigate('/multicloud-storage-manage/persistent-volume');
                }}
            />

            <PersistentVolumeEditorModal
                mode={editorState.mode}
                open={editorState.open}
                pvContent={editorState.pvContent}
                cluster={editorState.cluster}
                onOk={async () => {
                    message.success(
                        editorState.mode === 'create'
                            ? 'Persistent Volume created successfully'
                            : 'Persistent Volume updated successfully'
                    );
                    refetch();
                    setEditorState({
                        ...editorState,
                        open: false
                    });
                }}
                onCancel={() => {
                    setEditorState({
                        ...editorState,
                        open: false
                    });
                }}
            />
        </Panel>
    );
};

export default PersistentVolumePage;
