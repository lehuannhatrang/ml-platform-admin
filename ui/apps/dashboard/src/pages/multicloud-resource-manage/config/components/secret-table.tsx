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
import TagList from '@/components/tag-list';
import { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GetMemberResource } from '@/services/unstructured.ts';
import { Config, GetSecrets, Secret } from '@/services/config.ts';
import { calculateDuration } from '@/utils/time';
import { ClusterOption } from '@/hooks/use-cluster';

interface SecretTableProps {
  labelTagNum?: number;
  selectedWorkSpace: string;
  searchText: string;
  onViewSecret: (r: any, clusterName: string) => void;
  onEditSecret: (r: Secret, clusterName: string) => void;
  onDeleteSecretContent: (r: Secret, clusterName: string) => void;
  clusterOption: ClusterOption;
}
const SecretTable: FC<SecretTableProps> = (props) => {
  const {
    labelTagNum,
    selectedWorkSpace,
    searchText,
    onViewSecret,
    onEditSecret,
    onDeleteSecretContent,
    clusterOption,
  } = props;
  const { data, isLoading } = useQuery({
    queryKey: ['GetSecrets', clusterOption.label, selectedWorkSpace, searchText],
    queryFn: async () => {
      const services = await GetSecrets({
        namespace: selectedWorkSpace,
        keyword: searchText,
        cluster: clusterOption,
      });
      return services.data || {};
    },
  });
  const columns: TableColumnProps<Config>[] = [
    {
      title: i18nInstance.t('d1d64de5ff73bc8b408035fcdb2cc77c', '秘钥名称'),
      key: 'secretName',
      width: 300,
      render: (_, r) => {
        return r.objectMeta.name;
      },
    },
    ...(clusterOption.value === 'ALL' ? [{
      title: 'Cluster',
      key: 'cluster',
      onFilter: (value: React.Key | boolean, record: Config) => record.objectMeta.labels?.cluster === value,
      width: 100,
      render: (_: any, r: Config) => {
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
      title: i18nInstance.t('1f7be0a924280cd098db93c9d81ecccd', '标签信息'),
      key: 'labelName',
      align: 'left',
      width: '30%',
      render: (_, r) => {
        if (!r?.objectMeta?.labels) {
          return '-';
        }
        const params = Object.keys(r.objectMeta.labels).map((key) => {
          return {
            key: `${r.objectMeta.name}-${key}`,
            value: `${key}:${r.objectMeta.labels[key]}`,
          };
        });
        return <TagList tags={params} maxLen={labelTagNum} />;
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
                  cluster: r.objectMeta.labels?.cluster || clusterOption.label,
                });
                onViewSecret(ret?.data, r.objectMeta.labels?.cluster || clusterOption.label);
              }}
            >
              {i18nInstance.t('607e7a4f377fa66b0b28ce318aab841f', '查看')}
            </Button>
            <Button
              size={'small'}
              type="link"
              onClick={async () => {
                const ret = await GetMemberResource({
                  kind: r.typeMeta.kind,
                  name: r.objectMeta.name,
                  namespace: r.objectMeta.namespace,
                  cluster: r.objectMeta.labels?.cluster || clusterOption.label,
                });
                onEditSecret(ret?.data, r.objectMeta.labels?.cluster || clusterOption.label);
              }}
            >
              {i18nInstance.t('95b351c86267f3aedf89520959bce689', '编辑')}
            </Button>

            <Popconfirm
              placement="topRight"
              title={i18nInstance.t('dd7454e05ce9088395dbeb92bf939fd4', {
                name: r.objectMeta.name,
              })}
              onConfirm={() => {
                onDeleteSecretContent(r, r.objectMeta.labels?.cluster || clusterOption.label);
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
    <Table
      rowKey={(r: Config) =>
        `${r.objectMeta.labels?.cluster || clusterOption.label}-secret-${r.objectMeta.namespace}-${r.objectMeta.name}` || ''
      }
      columns={columns}
      loading={isLoading}
      dataSource={data?.secrets || []}
    />
  );
};
export default SecretTable;
