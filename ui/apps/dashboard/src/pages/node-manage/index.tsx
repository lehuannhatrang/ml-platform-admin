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
  Flex,
  Radio,
  Card,
  Spin,
} from 'antd';
import { Dendrogram } from '@ant-design/graphs';

import { useEffect, useState } from 'react';
import { useCluster } from '@/hooks';
import { Node } from '@/services/node';
import NodeDetailDrawer, { NodeDetailDrawerProps } from './node-detail-drawer';
import { useSearchParams } from 'react-router-dom';
import { TableOutlined, ApartmentOutlined } from '@ant-design/icons';

interface TreeNode {
  id: string;
  label?: string;
  style?: Record<string, any>;
  children?: TreeNode[];
  [key: string]: any;
}

const NodeManagePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const action = searchParams.get('action');
  const name = searchParams.get('name');
  const cluster = searchParams.get('cluster');

  const [nodeDetailData, setNodeDetailData] = useState<Omit<NodeDetailDrawerProps, 'onClose'>>({
    open: false,
    name: '',
    clusterName: '',
  });

  const { selectedCluster } = useCluster({});
  
  const [filter, setFilter] = useState({
    search: '',
  });

  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [dendrogramData, setDendrogramData] = useState<TreeNode | null>(null);

  const handleSearch = (value: string) => {
    setFilter(prevState => ({
      ...prevState,
      search: value,
    }));
  };

  // Fetch nodes data from API
  const { data, isLoading } = useQuery({
    queryKey: ['GetNodes', selectedCluster.value, filter.search],
    queryFn: async () => {
      const ret = await GetNodes({
        filterBy: ['name', filter.search],
      }, selectedCluster);
      return ret.data;
    },
  });

  useEffect(() => {
    if (action === 'view' && name && cluster) {
      const node = data?.items?.find(n => n.objectMeta.name === name && n.objectMeta.labels?.cluster === cluster);
      if (node) {
        setNodeDetailData({
          open: true,
          name: node.objectMeta.name,
          clusterName: node.objectMeta.annotations?.['cluster.x-k8s.io/cluster-name'] || selectedCluster.label,
        });
      }
    }
  }, [action, name, cluster, data, selectedCluster]);

  useEffect(() => {
    if (!data?.items) return;
    prepareDendrogramData();
  }, [data]);

  const columns: TableColumnProps<Node>[] = [
    {
      title: i18nInstance.t('c3f28b34bbdec501802fa403584267e6', '集群名称'),
      key: 'nodeName',
      width: 250,
      render: (_: any, r: Node) => {
        return r.objectMeta.name;
      },
    },
    ...(selectedCluster.value === 'ALL' ? [{
      title: 'Cluster',
      key: 'cluster',
      render: (_: any, r: Node) => {
        return r.objectMeta.annotations['cluster.x-k8s.io/cluster-name']
      },
    }] : []),
    {
      title: 'Role',
      key: 'role',
      render: (_: any, r: Node) => {
        const role = Object.keys(r.objectMeta.labels).find(key => key === 'node-role.kubernetes.io/control-plane') ? 'Master' : 'Worker'
        return <Tag color={role === 'Master' ? 'orange' : 'blue'}>{role}</Tag>
      },
    },
    {
      title: 'OS',
      key: 'os',
      render: (_: any, r: Node) => {
        return <Tag color="green">{`${r.objectMeta.labels['kubernetes.io/os'] || '-'}/${r.objectMeta.labels['kubernetes.io/arch'] || '-'}`}</Tag>
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
            <Button size={'small'} type="link" onClick={() => {
              setNodeDetailData({
                open: true,
                name: r.objectMeta.name,
                clusterName: r.objectMeta.annotations?.['cluster.x-k8s.io/cluster-name'] || selectedCluster.label,
              })
            }}>
              {i18nInstance.t('607e7a4f377fa66b0b28ce318aab841f', '查看')}
            </Button>
          </Space.Compact>
        );
      },
    },
  ];

  // Function to prepare Dendrogram data in the format expected by G6
  const prepareDendrogramData = () => {
    if (!data?.items) return;

    // Create root node
    const treeData: TreeNode = {
      id: 'root',
      style: { fill: '#91d5ff', stroke: '#5cdbd3' },
      children: []
    };

    // Group nodes by cluster
    const nodesByCluster: Record<string, TreeNode[]> = {};
    
    data.items.forEach((node) => {
      const clusterName = node.objectMeta.annotations?.['cluster.x-k8s.io/cluster-name'] || 'unknown';
      
      if (!nodesByCluster[clusterName]) {
        nodesByCluster[clusterName] = [];
      }
      
      const nodeRole = Object.keys(node.objectMeta.labels || {}).find(key => key === 'node-role.kubernetes.io/control-plane') ? 'Master' : 'Worker';
      const nodeStatus = node.status.conditions.find((c) => c.type === 'Ready') ? 'Ready' : 'Not Ready';
      
      // Create node object
      const nodeObj: TreeNode = {
        id: `${node.objectMeta.name} (Node)`,
        value: `${node.objectMeta.name}`,
        nodeRole,
        nodeStatus,
        style: { 
          fill: nodeStatus === 'Ready' ? '#52c41a' : '#f5222d',
          stroke: nodeStatus === 'Ready' ? '#52c41a' : '#f5222d',
        },
        children: []
      };
      
      nodesByCluster[clusterName].push(nodeObj);
    });
    
    // Create cluster nodes
    Object.keys(nodesByCluster).forEach((clusterName) => {
      const clusterNode: TreeNode = {
        id: `${clusterName} (Cluster)`,
        value: clusterName,
        style: { fill: '#1890ff', stroke: '#1890ff' },
        children: nodesByCluster[clusterName]
      };
      treeData.children?.push(clusterNode);
    });
    
    setDendrogramData(treeData);
  };

  return (
    <Panel>
      <div className="flex justify-between mb-4">
        <Input.Search
          placeholder='Search by node name'
          className={'w-[400px] mr-4'}
          onSearch={handleSearch}
          disabled={viewMode === 'graph'}
        />
        <Flex>
          <Radio.Group value={viewMode} onChange={e => setViewMode(e.target.value)}>
            <Radio.Button value="table"><TableOutlined /> Table</Radio.Button>
            <Radio.Button value="graph"><ApartmentOutlined /> Graph</Radio.Button>
          </Radio.Group>
        </Flex>
      </div>

      {viewMode === 'table' ? (
        <Table
          rowKey={(r: Node) => r.objectMeta.name || ''}
          columns={columns}
          loading={isLoading}
          dataSource={data?.items || []}
        />
      ) : (
        <Card style={{ minHeight: 500 }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
              <Spin size="large" />
            </div>
          ) : (
            <div style={{ height: 500, width: '100%' }}>
              {dendrogramData ? (
                <Dendrogram 
                  data={dendrogramData}
                  direction="horizontal"
                  autoFit="view"
                  behaviors={['click-select']}
                />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <Spin tip="Preparing visualization data..." />
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <NodeDetailDrawer
        open={nodeDetailData.open}
        name={nodeDetailData.name}
        clusterName={nodeDetailData.clusterName}
        onClose={() => {
          setSearchParams({});
          setNodeDetailData({
            open: false,
            name: '',
            clusterName: '',
          });
        }}
      />
    </Panel>
  );
};
export default NodeManagePage;
