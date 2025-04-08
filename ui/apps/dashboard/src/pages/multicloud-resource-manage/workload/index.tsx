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
  App,
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  TableColumnProps,
  Flex,
  Tag,
  Tooltip
} from 'antd';
import { Icons } from '@/components/icons';
import type { PodWorkload, Workload } from '@/services/workload';
import { GetWorkloads } from '@/services/workload';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { DeleteMemberResource, GetMemberResource } from '@/services/unstructured.ts';
import NewWorkloadEditorModal from './new-workload-editor-modal.tsx';
import WorkloadDetailDrawer, {
  WorkloadDetailDrawerProps,
} from './workload-detail-drawer.tsx';
import { useToggle } from '@uidotdev/usehooks';
import { stringify } from 'yaml';
import TagList from '@/components/tag-list';
import { WorkloadKind } from '@/services/base.ts';
import useNamespace from '@/hooks/use-namespace.ts';
import useCluster from '@/hooks/use-cluster';
import { calculateDuration } from '@/utils/time.ts';
import { getStatusFromCondition, getStatusTagColor } from '@/utils/resource.ts';
import dayjs from 'dayjs';
import LogsDrawer, { LogsDrawerProps } from './logs-drawer.tsx';
import { useNavigate, useSearchParams } from 'react-router-dom';

type WorkloadPageProps = {
  kind: WorkloadKind;
}

const WorkloadPage = ({ kind }: WorkloadPageProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const action = searchParams.get('action');
  const name = searchParams.get('name');
  const cluster = searchParams.get('cluster');
  const namespace = searchParams.get('namespace');

  const navigate = useNavigate();

  const { clusterOptions, selectedCluster } = useCluster({});

  const [filter, setFilter] = useState<{
    selectedWorkSpace: string;
    searchText: string;
  }>({
    selectedWorkSpace: '',
    searchText: '',
  });

  const { nsOptions, isNsDataLoading } = useNamespace({ clusterFilter: selectedCluster });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['GetWorkloads', kind, JSON.stringify(filter), selectedCluster.value],
    queryFn: async () => {
      const clusters = await GetWorkloads({
        kind,
        namespace: filter.selectedWorkSpace,
        keyword: filter.searchText,
        cluster: selectedCluster,
      });
      return clusters.data || {};
    },
    refetchInterval: 5000,
  });

  const [drawerData, setDrawerData] = useState<
    Omit<WorkloadDetailDrawerProps, 'onClose'>
  >({
    open: false,
    kind: WorkloadKind.Unknown,
    namespace: '',
    name: '',
    cluster: '',
  });

  useEffect(() => {
    if (action === 'view' && name && cluster && namespace) {
      const dataItems = data?.items || data?.deployments || data?.statefulSets || data?.daemonSets || data?.jobs || [];
      const workload = dataItems?.find(w => w.objectMeta.name === name && w.objectMeta.namespace === namespace && w.objectMeta.labels?.cluster === cluster);
      if (workload) {
        setDrawerData({
          open: true,
          kind,
          namespace,
          name,
          cluster,
        });
      }
    }
  }, [action, name, cluster, namespace, data]);

  const [logsDrawerData, setLogsDrawerData] = useState<
    Omit<LogsDrawerProps, 'onClose'>
  >({
    open: false,
    kind: WorkloadKind.Pod,
    namespace: '',
    name: '',
    cluster: '',
    containers: [],
  });
  const [showModal, toggleShowModal] = useToggle(false);
  const [editorState, setEditorState] = useState<{
    mode: 'create' | 'edit';
    content: string;
    cluster: string
  }>({
    mode: 'create',
    content: '',
    cluster: ''
  });
  const resetEditorState = useCallback(() => {
    setEditorState({
      mode: 'create',
      content: '',
      cluster: ''
    });
  }, []);

  const columns: TableColumnProps<Workload>[] = [
    {
      title: i18nInstance.t('89d19c60880d35c2bd88af0d9cc0497b', '负载名称'),
      key: `${kind}-name`,
      width: 250,
      render: (_, r) => {
        return r.objectMeta.name;
      },
    },
    ...(selectedCluster.value === 'ALL' ? [{
      title: 'Cluster',
      key: 'cluster',
      filters: clusterOptions.filter(option => option.value !== 'ALL').map((i) => ({ text: i.label, value: i.label })),
      onFilter: (value: React.Key | boolean, record: Workload) => record.objectMeta.labels?.cluster === value,
      width: 100,
      render: (_: any, r: Workload) => {
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
      title: 'Images',
      key: 'images',
      width: 200,
      render: (_: any, r: any) => {
        const images = kind === WorkloadKind.Pod ? 
          r.spec?.containers?.map((i: any) => ({ key: i.image, value: i.image })) 
        : [...new Set(r.containerImages)].map((i: any) => ({ key: i, value: i }))
        return <TagList tagStyle={{
          maxWidth: 200,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis'
        }} tags={images} />
      },
    },
    ...(kind === WorkloadKind.Pod ?
      [
        {
          title: 'Node',
          key: 'node',
          render: (_: any, r: any) => {
            return <Button type="link" onClick={() => {
              navigate(`/node-manage?action=view&name=${r.spec?.nodeName}&cluster=${r.objectMeta.labels?.cluster}`);
            }}>{r.spec?.nodeName || '-'}</Button>;
          },
        },
        {
          title: 'Status',
          key: 'status',
          render: (_: any, r: any) => {
            console.log('stats', r.status, r)
            const status = getStatusFromCondition(r.status?.conditions || [])
            return <Tag color={getStatusTagColor(status)}>{status}</Tag>
          },
        }]
      : []
    ),
    ...([WorkloadKind.Deployment, WorkloadKind.Statefulset, WorkloadKind.Daemonset, WorkloadKind.ReplicaSet].includes(kind) ? [
      {
        title: 'Ready',
        key: 'ready',
        render: (_: any, r: any) => {
          const podsStatus = r?.pods || r?.podInfo
          return `${podsStatus?.running || 0}/${podsStatus?.desired || 0}`
        },
      }
    ]
    : []),
    ...([WorkloadKind.Cronjob].includes(kind) ? [
      {
        title: 'Schedule',
        key: 'schedule',
        render: (_: any, r: any) => {
          return <b>{r.schedule}</b>
        },
      },
      {
        title: 'Status',
        key: 'Status',
        render: (_: any, r: any) => {
          return <Tag color={r.suspend ? 'red' : 'green'}>{r.suspend ? 'Suspend' : 'Running'}</Tag>
        },
      },
      {
        title: 'Last run',
        key: 'lastSchedule',
        render: (_: any, r: any) => {
          return <Tooltip title={dayjs.utc(r.lastSchedule).local().format('YYYY-MM-DD HH:mm:ss')}>
            {`${calculateDuration(r.lastSchedule)} ago`}
          </Tooltip> 
        },
      },
    ]
    : []),
    ...([WorkloadKind.Job].includes(kind) ? [
      {
        title: 'Status',
        key: 'Status',
        render: (_: any, r: any) => {
          return <Tag color={r.jobStatus?.status === 'Complete' ? 'green' : 'orange'}>{r.jobStatus?.status}</Tag>
        },
      },
      {
        title: 'Message',
        key: 'message',
        render: (_: any, r: any) => {
          return <div>{r.jobStatus?.message || '-'}</div>
        },
      }
    ] : []),
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
              onClick={() => {
                setDrawerData({
                  open: true,
                  kind: r.typeMeta.kind as WorkloadKind,
                  name: r.objectMeta.name,
                  namespace: r.objectMeta.namespace,
                  cluster: r.objectMeta.labels?.cluster || selectedCluster.label,
                });
              }}
            >
              {i18nInstance.t('607e7a4f377fa66b0b28ce318aab841f', '查看')}
            </Button>
            {kind === WorkloadKind.Pod && <Button
              size={'small'}
              type="link"
              onClick={() => {
                setLogsDrawerData({
                  open: true,
                  kind: r.typeMeta.kind as WorkloadKind,
                  name: r.objectMeta.name,
                  namespace: r.objectMeta.namespace,
                  cluster: r.objectMeta.labels?.cluster || selectedCluster.label,
                  containers: (r as PodWorkload).spec?.containers?.map((i: any) => i.name) || [],
                });
              }}
            >
              {'Logs'}
            </Button>}
            <Button
              size={'small'}
              type="link"
              onClick={async () => {
                const ret = await GetMemberResource({
                  kind: r.typeMeta.kind as WorkloadKind,
                  name: r.objectMeta.name,
                  namespace: r.objectMeta.namespace,
                  cluster: r.objectMeta.labels?.cluster || selectedCluster.label,
                });
                setEditorState({
                  mode: 'edit',
                  content: stringify(ret.data),
                  cluster: r.objectMeta.labels?.cluster || selectedCluster.label,
                });
                toggleShowModal(true);
              }}
            >
              {i18nInstance.t('95b351c86267f3aedf89520959bce689', '编辑')}
            </Button>

            <Popconfirm
              placement="topRight"
              title={i18nInstance.t('f0ade52acfa0bc5bd63e7cb29db84959', {
                name: r.objectMeta.name,
              })}
              onConfirm={async () => {
                // todo after delete, need to wait until resource deleted
                const ret = await DeleteMemberResource({
                  kind: r.typeMeta.kind,
                  name: r.objectMeta.name,
                  namespace: r.objectMeta.namespace,
                  cluster: r.objectMeta.labels?.cluster || selectedCluster.label,
                });
                if (ret.code === 200) {
                  await refetch();
                }
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
  const handleCloseDrawer = () => {
    setSearchParams({});
    setDrawerData({
      open: false,
      kind: WorkloadKind.Unknown,
      namespace: '',
      name: '',
      cluster: '',
    });
  };
  
  const { message: messageApi } = App.useApp();

  return (
    <Panel>
      <div className={'flex flex-row justify-between space-x-4 mb-4'}>
        <Flex>
          <Flex className='mr-4'>
            <h3 className={'leading-[32px]'}>
              {i18nInstance.t('280c56077360c204e536eb770495bc5f', '命名空间')}：
            </h3>
            <Select
              options={nsOptions}
              className={'min-w-[200px]'}
              value={filter.selectedWorkSpace}
              loading={isNsDataLoading}
              showSearch
              allowClear
              onChange={(v) => {
                setFilter({
                  ...filter,
                  selectedWorkSpace: v,
                });
              }}
            />
          </Flex>
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
        </Flex>
        <div className={'flex flex-row justify-between mb-4'}>
          <Button
            type={'primary'}
            icon={<Icons.add width={16} height={16} />}
            className="flex flex-row items-center"
            onClick={() => {
              toggleShowModal(true);
            }}
          >
            {i18nInstance.t('96d6b0fcc58b6f65dc4c00c6138d2ac0', '新增工作负载')}
          </Button>
        </div>
      </div>
      <Table
        rowKey={(r: Workload) =>
          `${r.objectMeta.labels?.cluster || selectedCluster.label}-${kind}-${r.objectMeta.namespace}-${r.objectMeta.name}` || ''
        }
        columns={columns}
        loading={isLoading}
        dataSource={
          data
            ? data.deployments ||
            data.statefulSets ||
            data.daemonSets ||
            data.jobs ||
            data.items
            : []
        }
      />

      <NewWorkloadEditorModal
        mode={editorState.mode}
        workloadContent={editorState.content}
        open={showModal}
        kind={kind}
        cluster={editorState.cluster}
        onOk={async (ret) => {
          const msg =
            editorState.mode === 'edit'
              ? i18nInstance.t('8347a927c09a4ec2fe473b0a93f667d0', '修改')
              : i18nInstance.t('66ab5e9f24c8f46012a25c89919fb191', '新增');
          if (ret.code === 200) {
            await messageApi.success(
              `${i18nInstance.t('c3bc562e9ffcae6029db730fe218515c', '工作负载')}${msg}${i18nInstance.t('330363dfc524cff2488f2ebde0500896', '成功')}`,
            );
            toggleShowModal(false);
            resetEditorState();
            await refetch();
          } else {
            await messageApi.error(
              `工作负载${msg}${i18nInstance.t('acd5cb847a4aff235c9a01ddeb6f9770', '失败')}`,
            );
          }
        }}
        onCancel={() => {
          resetEditorState();
          toggleShowModal(false);
        }}
      />

      <WorkloadDetailDrawer
        open={drawerData.open}
        kind={drawerData.kind}
        name={drawerData.name}
        namespace={drawerData.namespace}
        cluster={drawerData.cluster}
        onClose={handleCloseDrawer}
        onOpenLogs={({
          kind,
          namespace,
          name,
          cluster,
          containers,
        }) => {
          handleCloseDrawer();
          setLogsDrawerData({
            open: true,
            kind,
            namespace,
            name,
            cluster,
            containers,
          });
        }}
      />
      <LogsDrawer
        open={logsDrawerData.open}
        kind={logsDrawerData.kind}
        name={logsDrawerData.name}
        namespace={logsDrawerData.namespace}
        cluster={logsDrawerData.cluster}
        containers={logsDrawerData.containers}
        onClose={() => {
          setLogsDrawerData({
            open: false,
            kind: WorkloadKind.Pod,
            namespace: '',
            name: '',
            cluster: '',
            containers: [],
          });
        }}
      />
    </Panel>
  );
};
export default WorkloadPage;
