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
import { Button, Popconfirm, Space, Table, TableColumnProps } from 'antd';
import {
  GetServices,
  Service,
  ServiceType,
} from '@/services/service.ts';
import { FC, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GetMemberResource } from '@/services/unstructured.ts';
import { ClusterOption } from '@/hooks/use-cluster';
import { calculateDuration } from '@/utils/time';
interface ServiceTableProps {
  labelTagNum?: number;
  selectedWorkSpace: string;
  searchText: string;
  onEditServiceContent: (r: any, clusterName: string) => void;
  onDeleteServiceContent: (r: Service, clusterName: string) => void;
  clusterOption: ClusterOption;
}
const ServiceTable: FC<ServiceTableProps> = (props) => {
  const {
    selectedWorkSpace,
    searchText,
    onEditServiceContent,
    onDeleteServiceContent,
    clusterOption
  } = props;
  
  const { data, isLoading } = useQuery({
    queryKey: ['GetServices', clusterOption.value, selectedWorkSpace, searchText],
    queryFn: async () => {
      const services = await GetServices({
        namespace: selectedWorkSpace,
        keyword: searchText,
        cluster: clusterOption,
      });
      return services.data || {};
    },
    refetchInterval: 5000,
  });

  const columns: TableColumnProps<Service>[] = useMemo(() => [
    {
      title: i18nInstance.t('8f3747c057d893862fbe4b7980e9b451', '服务名称'),
      key: 'serviceName',
      width: 200,
      render: (_, r) => {
        return r.objectMeta.name;
      },
    },
    ...(clusterOption.value === 'ALL' ? [{
      title: 'Cluster',
      key: 'cluster',
      onFilter: (value: React.Key | boolean, record: Service) => record.objectMeta.labels?.cluster === value,
      width: 100,
      render: (_: any, r: Service) => {
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
      title: 'Cluster IP',
      key: 'clusterIP',
      width: 200,
      render: (_, r) => {
        return r.clusterIP;
      },
    },
    {
      title: 'External IP',
      key: 'externalIP',
      width: 200,
      render: (_, r) => {
        return r.externalEndpoints.map((e) => e.host).join(', ') || '-';
      },
    },
    {
      title: 'Ports',
      key: 'ports',
      width: 200,
      render: (_, r) => {
        return r.internalEndpoint.ports?.map((p) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol}`).join(', ');
      },
    },
    {
      title: 'Type',
      key: 'type',
      width: 200,
      filters: [
        {
          text: ServiceType.ClusterIP,
          value: ServiceType.ClusterIP,
        },
        {
          text: ServiceType.LoadBalancer,
          value: ServiceType.LoadBalancer,
        },
        {
          text: ServiceType.ExternalName,
          value: ServiceType.ExternalName,
        },
        {
          text: ServiceType.NodePort,
          value: ServiceType.NodePort,
        },
      ],
      onFilter: (value, record) => record.type.includes(value as string),
      render: (_, r) => {
        return r.type;
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
            <Button
              size={'small'}
              type="link"
              onClick={async () => {
                const ret = await GetMemberResource({
                  kind: r.typeMeta.kind,
                  name: r.objectMeta.name,
                  namespace: r.objectMeta.namespace,
                  cluster: r.objectMeta.labels?.cluster || clusterOption.label
                });
                onEditServiceContent(ret?.data, r.objectMeta.labels?.cluster || clusterOption.label);
              }}
            >
              {i18nInstance.t('95b351c86267f3aedf89520959bce689', '编辑')}
            </Button>

            <Popconfirm
              placement="topRight"
              title={i18nInstance.t('6163856192e115e6b914d6fb8c4fd82c', {
                name: r.objectMeta.name,
              })}
              onConfirm={() => {
                onDeleteServiceContent(r, r.objectMeta.labels?.cluster || clusterOption.label);
              }}
              okText={i18nInstance.t(
                'e83a256e4f5bb4ff8b3d804b5473217a',
                '确认',
              )}
              cancelText={i18nInstance.t('625fb26b4b3340f7872b411f401e754c')}
            >
              <Button size={'small'} type="link" danger>
                {i18nInstance.t('2f4aaddde33c9b93c36fd2503f3d122b', '删除')}
              </Button>
            </Popconfirm>
          </Space.Compact>
        );
      },
    },
  ], [clusterOption]);
  
  return (
    <Table
      rowKey={(r: Service) =>
        `${r.objectMeta.labels?.cluster || clusterOption.label}-service-${r.objectMeta.namespace}-${r.objectMeta.name}` || ''
      }
      columns={columns}
      loading={isLoading}
      dataSource={data?.services || []}
    />
  );
};
export default ServiceTable;
