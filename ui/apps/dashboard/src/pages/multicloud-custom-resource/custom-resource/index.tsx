import React, { useState } from 'react';
import { Input, Select, Space, Table } from 'antd';
import { ColumnsType } from 'antd/es/table';
import _ from 'lodash';
import { useCluster } from '@/hooks';
import { ClusterOption, DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import { useQuery } from '@tanstack/react-query';
import { CustomResourceDefinition, CustomResourceDefinitionByGroup, GetCustomResourceDefinitionByGroup } from '@/services';
import { calculateDuration } from '@/utils/time';
import CustomResourceDrawer from './custom-resource-drawer';
import Panel from '@/components/panel';
import i18nInstance from '@/utils/i18n';


const CustomResourcePage: React.FC = () => {
  const { selectedCluster } = useCluster({});

  const [filter, setFilter] = useState<{
    searchText: string;
  }>({
    searchText: '',
  });

  const { data: crdByGroupData, isLoading } = useQuery({
    queryKey: ['get-api-versions', JSON.stringify(filter), selectedCluster.value],
    queryFn: async () => {
      const clusters = await GetCustomResourceDefinitionByGroup({
        cluster: selectedCluster,
      });
      return clusters.data || {};
    },
  });


  const columns: ColumnsType<CustomResourceDefinitionByGroup> = [
    {
      title: 'Group',
      key: 'group',
      render: (record) => <strong className="text-blue-500">{record.group}</strong>,
      sorter: (a, b) => a.group.localeCompare(b.group),
    },
    {
      title: 'Cluster',
      dataIndex: 'cluster',
      key: 'cluster',
    },
    {
      title: 'CRDs Count',
      dataIndex: 'count',
      key: 'count',
    },
  ];


  const expandColumns = [
    { title: 'Kind Name', key: 'kind-name', render: (record: CustomResourceDefinition) => record.acceptedNames.kind },
    { title: 'Name', key: 'name', render: (record: CustomResourceDefinition) => record.metadata.name },
    { title: 'Scope', key: 'scope', render: (record: CustomResourceDefinition) => record.spec.scope },
    { title: 'Age', key: 'age', render: (record: CustomResourceDefinition) => calculateDuration(record.metadata.creationTimestamp) },
  ];


  const [selectedResource, setSelectedResource] = React.useState<{
    open: boolean;
    cluster: string;
    group: string;
    crd: string;
  }>({ open: false, cluster: '', group: '', crd: '' });

  const handleRowClick = (record: CustomResourceDefinition) => {
    setSelectedResource({
      open: true,
      cluster: record.metadata.labels?.cluster || '',
      group: record.spec.group,
      crd: record.metadata.name,
    });
  };

  const handleDrawerClose = () => {
    setSelectedResource(prev => ({ ...prev, open: false }));
  };

  const expandedRowRender = (record: CustomResourceDefinitionByGroup) => (
    <Table
      columns={expandColumns}
      dataSource={record.crds}
      pagination={false}
      onRow={(record) => {
        return {
          onClick: () => handleRowClick(record),
        };
      }}
    />
  )

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
          }} />
      </div>
      <Table
        columns={columns}
        dataSource={crdByGroupData?.groups || []}
        rowKey={(record) => `customResourceGroup-${record.group}-${record.cluster}`}
        loading={isLoading}
        expandable={{
          expandedRowRender,
          expandRowByClick: true,
        }}
      />

      <CustomResourceDrawer
        open={selectedResource.open}
        onClose={handleDrawerClose}
        cluster={selectedResource.cluster}
        group={selectedResource.group}
        crd={selectedResource.crd}
      />
    </Panel>
  );
};

export default CustomResourcePage;
