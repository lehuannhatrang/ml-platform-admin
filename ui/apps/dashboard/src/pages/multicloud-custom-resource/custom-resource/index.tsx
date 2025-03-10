import React, { useState } from 'react';
import { Select, Space, Table } from 'antd';
import { ColumnsType } from 'antd/es/table';
import _ from 'lodash';
import { useCluster } from '@/hooks';
import { ClusterOption, DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import { useQuery } from '@tanstack/react-query';
import { CustomResourceDefinition, CustomResourceDefinitionByGroup, GetCustomResourceDefinitionByGroup } from '@/services';
import { calculateDuration } from '@/utils/time';
import CustomResourceDrawer from './custom-resource-drawer';
import Panel from '@/components/panel';


const CustomResourcePage: React.FC = () => {
  const [filter, setFilter] = useState<{
    selectedCluster: ClusterOption;
    selectedWorkSpace: string;
    searchText: string;
  }>({
    selectedCluster: DEFAULT_CLUSTER_OPTION,
    selectedWorkSpace: '',
    searchText: '',
  });

  const { data: crdByGroupData, isLoading } = useQuery({
    queryKey: ['get-api-versions', JSON.stringify(filter)],
    queryFn: async () => {
      const clusters = await GetCustomResourceDefinitionByGroup({
        cluster: filter.selectedCluster,
      });
      return clusters.data || {};
    },
  });

  const { clusterOptions, isClusterDataLoading } = useCluster({});

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

        <Space>
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
        </Space>
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
