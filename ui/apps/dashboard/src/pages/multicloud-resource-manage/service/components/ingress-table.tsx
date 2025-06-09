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
import { Button, Popconfirm, Space, Table, TableColumnProps, Tooltip } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  GetIngress,
  Ingress,
} from '@/services/service.ts';
import { FC, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClusterOption } from '@/hooks/use-cluster';
import { calculateDuration } from '@/utils/time';
import { GetMemberResource } from '@/services/unstructured';

interface ServiceTableProps {
  selectedWorkSpace: string;
  searchText: string;
  onEditIngressContent: (r: Ingress, clusterName: string) => void;
  onDeleteIngressContent: (r: Ingress, clusterName: string) => void;
  onViewIngress: (r: Ingress, clusterName: string) => void;
  clusterOption: ClusterOption;
}
const IngressTable: FC<ServiceTableProps> = (props) => {
  const {
    selectedWorkSpace,
    searchText,
    onEditIngressContent,
    onDeleteIngressContent,
    onViewIngress,
    clusterOption,
  } = props;
  
  const { data, isLoading } = useQuery({
    queryKey: ['GetIngress',  clusterOption.value, selectedWorkSpace, searchText],
    queryFn: async () => {
      const services = await GetIngress({
        namespace: selectedWorkSpace,
        keyword: searchText,
        cluster: clusterOption,
      });
      return services.data || {};
    },
    refetchInterval: 5000,
  });

  const columns: TableColumnProps<Ingress>[] = useMemo(() => [
    {
      title: i18nInstance.t('d7ec2d3fea4756bc1642e0f10c180cf5', '名称'),
      key: 'ingressName',
      width: 300,
      render: (_, r) => {
        return (
          <a onClick={() => onViewIngress(r, r.objectMeta.labels?.cluster || clusterOption.label)}>
            {r.objectMeta.name}
          </a>
        );
      },
    },
    ...(clusterOption.value === 'ALL' ? [{
      title: 'Cluster',
      key: 'cluster',
      onFilter: (value: React.Key | boolean, record: Ingress) => record.objectMeta.labels?.cluster === value,
      width: 100,
      render: (_: any, r: Ingress) => {
        return r.objectMeta.labels?.cluster || '-';
      },
    }] : []),
    {
      title: i18nInstance.t('a4b28a416f0b6f3c215c51e79e517298', '命名空间'),
      key: 'namespaceName',
      width: 200,
      render: (_, r) => {
        return r.objectMeta.namespace;
      },
    },
    {
      title: 'LoadBalancer',
      key: 'loadBalancer',
      width: 200,
      render: (_, r) => {
        return r.endpoints.map(e => e.host).join(', ')
      },
    },
    {
      title: 'Age',
      key: 'age',
      render: (_, r) => {
        return calculateDuration(r.objectMeta.creationTimestamp);
      },
      width: 120,
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.objectMeta.creationTimestamp).getTime() - new Date(b.objectMeta.creationTimestamp).getTime(),
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
                onClick={() => onViewIngress(r, r.objectMeta.labels?.cluster || clusterOption.label)}
              />
            </Tooltip>
            <Tooltip title="Edit">
              <Button
                size='middle'
                type="link"
                icon={<EditOutlined />}
                onClick={async () => {
                  const ret = await GetMemberResource({
                    kind: r.typeMeta.kind,
                    name: r.objectMeta.name,
                    namespace: r.objectMeta.namespace,
                    cluster: r.objectMeta.labels?.cluster || clusterOption.label
                  });
                  onEditIngressContent(ret?.data, r.objectMeta.labels?.cluster || clusterOption.label);
                }}
              />
            </Tooltip>

            <Popconfirm
              placement="topRight"
              title={i18nInstance.t('6163856192e115e6b914d6fb8c4fd82c', {
                name: r.objectMeta.name,
              })}
              onConfirm={() => {
                onDeleteIngressContent(r, r.objectMeta.labels?.cluster || clusterOption.label);
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
  ], [clusterOption, onEditIngressContent, onDeleteIngressContent, onViewIngress]);
  
  return (
    <Table
      rowKey={(r: Ingress) =>
        `${r.objectMeta.labels?.cluster || clusterOption.label}-ingress-${r.objectMeta.namespace}-${r.objectMeta.name}` || ''
      }
      columns={columns}
      loading={isLoading}
      dataSource={data?.items || []}
    />
  );
};
export default IngressTable;
