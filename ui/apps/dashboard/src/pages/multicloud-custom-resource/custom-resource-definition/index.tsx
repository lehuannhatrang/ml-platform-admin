import React, { useMemo, useState } from 'react';
import { Button, Input, Popconfirm, Space, Table, message, Tooltip } from 'antd';
import { ColumnsType } from 'antd/es/table';
import _ from 'lodash';
import { useCluster } from '@/hooks';
import { useQuery } from '@tanstack/react-query';
import { CustomResourceDefinition, GetCustomResourceDefinitions, UpdateCustomResourceDefinition, CreateCustomResourceDefinition } from '@/services';
import i18nInstance from '@/utils/i18n';
import Panel from '@/components/panel';
import CustomResourceDefinitionDrawer from './custom-resource-definition-drawer';
import CustomResourceDefinitionEditModal from './custom-resource-definition-edit-modal';
import { PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const CustomResourceDefinitionPage: React.FC = () => {
    const { clusterOptions, selectedCluster } = useCluster({});

    const [filter, setFilter] = useState<{
        searchText: string;
    }>({
        searchText: '',
    });

    // State for the drawer
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [selectedCrd, setSelectedCrd] = useState<{name: string, cluster: string} | null>(null);

    // State for the edit modal
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editCrd, setEditCrd] = useState<{name: string, cluster: string} | null>(null);
    
    // State for the new CRD modal
    const [newCrdModalVisible, setNewCrdModalVisible] = useState(false);

    const { data: customResourceDefinitionsData, isLoading, refetch } = useQuery({
        queryKey: ['get-custom-resource-definitions', selectedCluster.value],
        queryFn: async () => {
            const clusters = await GetCustomResourceDefinitions({
                cluster: selectedCluster,
            });
            return clusters.data || {};
        },
    });
    
    const filteredCustomResourceDefinitions = useMemo(() => {
        if (!filter.searchText) {
            return customResourceDefinitionsData?.items || [];
        }
        return customResourceDefinitionsData?.items?.filter((crd) => {
            return crd.metadata?.name?.toLowerCase().includes(filter.searchText.toLowerCase());
        }) || [];
    }, [customResourceDefinitionsData, filter.searchText]);


    // Handler to open the drawer with CRD details
    const handleViewCrd = (crd: CustomResourceDefinition) => {
        const clusterName = crd.metadata?.labels?.cluster || '';
        const crdName = crd.metadata?.name || '';
        
        if (crdName && clusterName) {
            setSelectedCrd({
                name: crdName,
                cluster: clusterName
            });
            setDrawerVisible(true);
        }
    };

    // Handler to close the drawer
    const handleCloseDrawer = () => {
        setDrawerVisible(false);
        setSelectedCrd(null);
    };

    // Handler to open the edit modal
    const handleEditCrd = (crd: CustomResourceDefinition) => {
        const clusterName = crd.metadata?.labels?.cluster || '';
        const crdName = crd.metadata?.name || '';
        
        if (crdName && clusterName) {
            setEditCrd({
                name: crdName,
                cluster: clusterName
            });
            setEditModalVisible(true);
        }
    };

    // Handler to open the new CRD modal
    const handleAddCrd = () => {
        setNewCrdModalVisible(true);
    };

    // Handler to close the edit modal
    const handleCloseEditModal = () => {
        setEditModalVisible(false);
        setEditCrd(null);
    };
    
    // Handler to close the new CRD modal
    const handleCloseNewCrdModal = () => {
        setNewCrdModalVisible(false);
    };

    // Handler to save CRD changes
    const handleSaveCrd = async (crdData: any) => {
        if (!editCrd) return;
        
        try {
            await UpdateCustomResourceDefinition({
                cluster: editCrd.cluster,
                crdName: editCrd.name,
                crdData: crdData
            });
            
            // Refresh the CRD list
            await refetch();
            message.success('CRD updated successfully');
            return Promise.resolve();
        } catch (error) {
            console.error('Failed to update CRD:', error);
            message.error('Failed to update CRD');
            return Promise.reject(error);
        }
    };
    
    // Handler to create new CRD
    const handleCreateCrd = async (crdData: any) => {
        try {
            await CreateCustomResourceDefinition({
                cluster: crdData.clusterName,
                crdData: crdData
            });
            
            // Refresh the CRD list
            await refetch();
            message.success('CRD created successfully');
            return Promise.resolve();
        } catch (error) {
            console.error('Failed to create CRD:', error);
            message.error('Failed to create CRD');
            return Promise.reject(error);
        }
    };

    const columns: ColumnsType<CustomResourceDefinition> = [
        {
            title: 'Name',
            key: 'name',
            render: (record) => record?.metadata?.name,
        },
        {
            title: 'Kind',
            key: 'kind',
            render: (record) => record?.acceptedNames?.kind || '-',
        },
        ...(selectedCluster.value === 'ALL' ? [{
            title: 'Cluster',
            key: 'cluster',
            filters: clusterOptions.filter(option => option.value !== 'ALL').map((i) => ({ text: i.label, value: i.label })),
            onFilter: (value: React.Key | boolean, record: CustomResourceDefinition) => record.metadata?.labels?.cluster === value,
            render: (_: any, r: CustomResourceDefinition) => {
                return r.metadata?.labels?.cluster || '-';
            },
        }] : []),
        {
            title: 'Group',
            key: 'group',
            render: (record) => record?.spec?.group,
        },
        {
            title: 'Scope',
            key: 'scope',
            render: (record) => record?.spec?.scope,
            filters: [{ text: 'Cluster', value: 'Cluster' }, { text: 'Namespaced', value: 'Namespaced' }],
            onFilter: (value: React.Key | boolean, record: CustomResourceDefinition) => record.spec?.scope === value,
        },
        {
            title: i18nInstance.t('2b6bc0f293f5ca01b006206c2535ccbc', '操作'),
            key: 'op',
            width: 200,
            render: (_, r) => {
                return (
                    <Space.Compact>
                        <Tooltip title="View">
                            <Button
                                size='middle'
                                type="link"
                                icon={<EyeOutlined />}
                                onClick={() => handleViewCrd(r)}
                            />
                        </Tooltip>
                        <Tooltip title="Edit">
                            <Button
                                size='middle'
                                type="link"
                                icon={<EditOutlined />}
                                onClick={() => handleEditCrd(r)}
                            />
                        </Tooltip>

                        <Popconfirm
                            placement="topRight"
                            title={`Do you want to delete "${r.metadata?.name}" CRD?`}
                            onConfirm={async () => {
                                // todo after delete, need to wait until resource deleted

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
                            <Button size='middle' type="link" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </Space.Compact>
                );
            },
        },
    ];

    return (
        <Panel>
            <div className={'flex flex-row justify-between space-x-4 mb-4'}>
                <Input.Search
                    placeholder={i18nInstance.t(
                        'cfaff3e369b9bd51504feb59bf0972a0',
                        '按命名空间搜索',
                    )}
                    className={'w-[300px]'}
                    onPressEnter={(e) => {
                        const input = e.currentTarget.value;
                        setFilter({
                            ...filter,
                            searchText: input,
                        });
                    }}
                />
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    onClick={handleAddCrd}
                >
                    Add CRD
                </Button>
            </div>
            <Table
                columns={columns}
                dataSource={filteredCustomResourceDefinitions}
                rowKey={(record) => `crd-${record?.metadata?.name}-${record?.metadata?.labels?.cluster}`}
                loading={isLoading}
            />

            {/* CRD Drawer */}
            {selectedCrd && (
                <CustomResourceDefinitionDrawer
                    open={drawerVisible}
                    onClose={handleCloseDrawer}
                    crdName={selectedCrd.name}
                    clusterName={selectedCrd.cluster}
                />
            )}

            {/* CRD Edit Modal */}
            {editCrd && (
                <CustomResourceDefinitionEditModal
                    open={editModalVisible}
                    onClose={handleCloseEditModal}
                    onSave={handleSaveCrd}
                    crdName={editCrd.name}
                    clusterName={editCrd.cluster}
                />
            )}
            
            {/* New CRD Modal */}
            <CustomResourceDefinitionEditModal
                open={newCrdModalVisible}
                onClose={handleCloseNewCrdModal}
                onSave={handleCreateCrd}
                crdName=""
                clusterName=""
                isNew={true}
            />
        </Panel>
    );
};

export default CustomResourceDefinitionPage;
