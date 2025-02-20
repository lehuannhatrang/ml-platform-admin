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
import { useQuery } from '@tanstack/react-query';
import { GetNodes } from '@/services';
import {
  Badge,
  Tag,
  Table,
  TableColumnProps,
  Space,
  Button,
  Input,
  message,
  Popconfirm,
  Flex,
  Select,
} from 'antd';
import { useState } from 'react';
import { useCluster } from '@/hooks';
import { ClusterOption, DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';
import { Node } from '@/services/node';

const NodeManagePage = () => {
  const [filter, setFilter] = useState<{
    selectedCluster: ClusterOption;
    searchText: string;
  }>({
    selectedCluster: DEFAULT_CLUSTER_OPTION,
    searchText: '',
  });
  const [_messageApi, messageContextHolder] = message.useMessage();
  const { data, isLoading } = useQuery({
    queryKey: ['GetNodes', filter.selectedCluster, filter.searchText],
    queryFn: async () => {
      const ret = await GetNodes({}, filter.selectedCluster);
      return ret.data;
    },
  });

  const { clusterOptions, isClusterDataLoading } = useCluster({});

  const columns: TableColumnProps<Node>[] = [
    {
      title: i18nInstance.t('c3f28b34bbdec501802fa403584267e6', '集群名称'),
      key: 'nodeName',
      width: 250,
      render: (_: any, r: Node) => {
        return r.objectMeta.name;
      },
    },
    ...(filter.selectedCluster.value === 'ALL' ? [{
      title: 'Cluster',
      key: 'cluster',
      render: (_: any, r: Node) => {
        return r.objectMeta.annotations['cluster.x-k8s.io/cluster-name']
      },
    }] : []),
    {
      title: 'OS',
      key: 'os',
      render: (_: any, r: Node) => {
        return <Tag color="blue">{`${r.objectMeta.labels['kubernetes.io/os'] || '-'}/${r.objectMeta.labels['kubernetes.io/arch'] || '-'}`}</Tag>
      },
    },
    {
      title: 'Kubelet version',
      key: 'kubelet',
      align: 'center',
      render: (_, r) => {
        return r.status.nodeInfo.kubeletVersion || '-';
      },
    },
    {
      title: 'Internal IP',
      key: 'internalIp',
      align: 'center',
      render: (_, r) => {
        return r.status.addresses.filter((a) => a.type === 'InternalIP').map((a) => a.address).join(',') || '-';
      },
    },
    {
      title: 'Node Status',
      key: 'ready',
      align: 'center',
      width: 150,
      render: (r: Node) => {
        const v = r.status.conditions.find((c) => c.type === 'Ready');
        if (v) {
          return (
            <Badge
              color={'green'}
              text={
                <span
                  style={{
                    color: '#52c41a',
                  }}
                >
                  Ready
                </span>
              }
            />
          );
        } else {
          return (
            <Badge
              color={'red'}
              text={
                <span
                  style={{
                    color: '#f5222d',
                  }}
                >
                  Not Ready
                </span>
              }
            />
          );
        }
      },
    },
    {
      title: i18nInstance.t('2b6bc0f293f5ca01b006206c2535ccbc', '操作'),
      key: 'op',
      width: 200,
      render: (_, r) => {
        return (
          <Space.Compact>
            <Button size={'small'} type="link">
              {i18nInstance.t('607e7a4f377fa66b0b28ce318aab841f', '查看')}
            </Button>
            <Popconfirm
              placement="topRight"
              title={`Do you want to delete ${r.objectMeta.name} node?`}
              onConfirm={async () => {
                //
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
  return (
    <Panel>
      <div className={'flex flex-row justify-between mb-4'}>
        <Flex className='mr-4'>
          <h3 className={'leading-[32px]'}>
            {i18nInstance.t('85fe5099f6807dada65d274810933389')}：
          </h3>
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
        </Flex>
        <Input.Search
          placeholder='Search by node name'
          className={'w-[400px]'}
        />
      </div>
      <Table
        rowKey={(r: Node) => r.objectMeta.name || ''}
        columns={columns}
        loading={isLoading}
        dataSource={data?.items || []}
      />

      {messageContextHolder}
    </Panel>
  );
};
export default NodeManagePage;
