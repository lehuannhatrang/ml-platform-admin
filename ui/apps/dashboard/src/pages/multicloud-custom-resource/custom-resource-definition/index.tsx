import React, { useState } from 'react';
import { Button, Flex, Input, Popconfirm, Select, Space, Table } from 'antd';
import { ColumnsType } from 'antd/es/table';
import _ from 'lodash';
import { useCluster } from '@/hooks';
import { ClusterOption, DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import { useQuery } from '@tanstack/react-query';
import { CustomResourceDefinition, GetCustomResourceDefinitions } from '@/services';
import i18nInstance from '@/utils/i18n';
import Panel from '@/components/panel';


const CustomResourceDefinitionPage: React.FC = () => {
    const [filter, setFilter] = useState<{
        selectedCluster: ClusterOption;
        searchText: string;
    }>({
        selectedCluster: DEFAULT_CLUSTER_OPTION,
        searchText: '',
    });

    const { data: customResourceDefinitionsData, isLoading } = useQuery({
        queryKey: ['get-custom-resource-definitions', JSON.stringify(filter)],
        queryFn: async () => {
            const clusters = await GetCustomResourceDefinitions({
                cluster: filter.selectedCluster,
            });
            return clusters.data || {};
        },
    });

    const { clusterOptions, isClusterDataLoading } = useCluster({});

    const columns: ColumnsType<CustomResourceDefinition> = [
        {
            title: 'Name',
            key: 'name',
            render: (record) => record?.acceptedNames?.kind || record?.metadata?.name,
        },
        ...(filter.selectedCluster.value === 'ALL' ? [{
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
                        <Button
                            size={'small'}
                            type="link"
                            onClick={() => {
                                //
                            }}
                        >
                            {i18nInstance.t('607e7a4f377fa66b0b28ce318aab841f', '查看')}
                        </Button>
                        <Button
                            size={'small'}
                            type="link"
                            onClick={async () => {
                                //
                            }}
                        >
                            {i18nInstance.t('95b351c86267f3aedf89520959bce689', '编辑')}
                        </Button>

                        <Popconfirm
                            placement="topRight"
                            title={i18nInstance.t('f0ade52acfa0bc5bd63e7cb29db84959', {
                                name: r.metadata.name,
                            })}
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
                            <Button size={'small'} type="link" danger>
                                {i18nInstance.t('2f4aaddde33c9b93c36fd2503f3d122b', '删除')}
                            </Button>
                        </Popconfirm>
                    </Space.Compact>
                );
            },
        },
    ];

    console.log(customResourceDefinitionsData)

    return (
        <Panel>
            <div className={'flex flex-row justify-between space-x-4 mb-4'}>
                <Flex>
                    <Select
                        options={clusterOptions}
                        className={'min-w-[200px]'}
                        value={filter.selectedCluster?.value}
                        loading={isClusterDataLoading}
                        showSearch
                        onChange={(_v: string, option: ClusterOption | ClusterOption[]) => {
                            setFilter({
                                ...filter,
                                selectedCluster: option as ClusterOption,
                            });
                        }}
                    />
                    <Input.Search
                        placeholder={i18nInstance.t(
                            'cfaff3e369b9bd51504feb59bf0972a0',
                            '按命名空间搜索',
                        )}
                        className={'w-[300px] ml-4'}
                        onPressEnter={(e) => {
                            const input = e.currentTarget.value;
                            setFilter({
                                ...filter,
                                searchText: input,
                            });
                        }}
                    />
                </Flex>
            </div>
            <Table
                columns={columns}
                dataSource={customResourceDefinitionsData?.items || []}
                rowKey={(record) => `crd-${record?.metadata?.name}-${record?.metadata?.labels?.cluster}`}
                loading={isLoading}
            />
        </Panel>
    );
};

export default CustomResourceDefinitionPage;
