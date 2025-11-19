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
import { GetClusters } from '@/services';
import {
  Cluster,
  ClusterDetail,
  DeleteCluster,
  GetClusterDetail,
} from '@/services/cluster';
import {
  Badge,
  Tag,
  Table,
  TableColumnProps,
  Progress,
  Space,
  Button,
  Input,
  message,
  Popconfirm,
  Flex,
  Tooltip,
} from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { Icons } from '@/components/icons';
import NewClusterModal from './new-cluster-modal';
import CreateCAPIClusterModal from './create-capi-cluster-modal';
import ClusterUsersModal from './cluster-users-modal';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCluster } from '@/hooks';

function getPercentColor(v: number): string {
  if (v <= 60) {
    return '#52C41A';
  } else if (v <= 80) {
    return '#FAAD14';
  } else {
    return '#F5222D';
  }
}

const ClusterManagePage = () => {
  const [messageApi, messageContextHolder] = message.useMessage();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['GetClusters'],
    queryFn: async () => {
      const ret = await GetClusters();
      return ret.data;
    },
  });
  const [clusterModalData, setModalData] = useState<{
    mode: 'create' | 'edit';
    open: boolean;
    clusterDetail?: ClusterDetail;
  }>({
    mode: 'create',
    open: false,
  });

  // State for CAPI cluster creation modal
  const [capiModalOpen, setCapiModalOpen] = useState(false);

  // State for user management modal
  const [usersModalData, setUsersModalData] = useState<{
    open: boolean;
    clusterName: string;
  }>({
    open: false,
    clusterName: '',
  });


  const navigate = useNavigate();

  const { setSelectedCluster } = useCluster({});

  const handleClusterView = (clusterInfo: Cluster) => {
    setSelectedCluster({ label: clusterInfo.objectMeta.name, value: clusterInfo.objectMeta.uid });
    navigate(`/overview`);
  }

  const columns: TableColumnProps<Cluster>[] = [
    {
      title: i18nInstance.t('c3f28b34bbdec501802fa403584267e6', '集群名称'),
      key: 'clusterName',
      width: 150,
      render: (_, r) => {
        r.ready;
        return r.objectMeta.name;
      },
    },
    {
      title: i18nInstance.t(
        'bd17297989ec345cbc03ae0b8a13dc0a',
        'kubernetes版本',
      ),
      dataIndex: 'kubernetesVersion',
      key: 'kubernetesVersion',
      width: 150,
      align: 'center',
    },
    {
      title: i18nInstance.t('ee00813361387a116d274c608ba8bb13', '集群状态'),
      dataIndex: 'ready',
      key: 'ready',
      align: 'center',
      width: 150,
      render: (v) => {
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
                  ready
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
                  not ready
                </span>
              }
            />
          );
        }
      },
    },
    {
      title: i18nInstance.t('f0789e79d48f135e5d870753f7a85d05', '模式'),
      dataIndex: 'syncMode',
      width: 150,
      align: 'center',
      render: (v) => {
        if (v === 'Push') {
          return <Tag color={'gold'}>{v}</Tag>;
        } else {
          return <Tag color={'blue'}>{v}</Tag>;
        }
      },
    },
    {
      title: i18nInstance.t('b86224e030e5948f96b70a4c3600b33f', '节点状态'),
      dataIndex: 'nodeStatus',
      align: 'center',
      width: 150,
      render: (_, r) => {
        if (r.nodeSummary) {
          const { totalNum, readyNum } = r.nodeSummary;
          return (
            <>
              {readyNum}/{totalNum}
            </>
          );
        }
        return '-';
      },
    },
    {
      title: i18nInstance.t('763a78a5fc84dbca6f0137a591587f5f', 'cpu用量'),
      dataIndex: 'cpuFraction',
      width: '15%',
      render: (_, r) => {
        const fraction = parseFloat(
          r.allocatedResources.cpuFraction.toFixed(2),
        );
        return (
          <Progress
            percent={fraction}
            strokeColor={getPercentColor(fraction)}
          />
        );
      },
    },
    {
      title: i18nInstance.t('8b2e672e8b847415a47cc2dd25a87a07', 'memory用量'),
      dataIndex: 'memoryFraction',
      width: '15%',
      render: (_, r) => {
        const fraction = parseFloat(
          r.allocatedResources.memoryFraction.toFixed(2),
        );
        return (
          <Progress
            percent={fraction}
            strokeColor={getPercentColor(fraction)}
          />
        );
      },
    },
    {
      title: i18nInstance.t('2b6bc0f293f5ca01b006206c2535ccbc', '操作'),
      key: 'op',
      width: 200,
      render: (_, r) => {
        return (
          <Space.Compact>
            <Tooltip title="View">
              <Button size='middle' type="link" icon={<EyeOutlined />} onClick={() => handleClusterView(r)} />
            </Tooltip>
            <Tooltip title="Users">
              <Button
                size='middle'
                type="link"
                icon={<UserOutlined />}
                onClick={() => {
                  setUsersModalData({
                    open: true,
                    clusterName: r.objectMeta.name,
                  });
                }}
                disabled={r.objectMeta.name === 'mgmt-cluster'}
              />
            </Tooltip>
            <Tooltip title="Edit">
              <Button
                size='middle'
                type="link"
                icon={<EditOutlined />}
                onClick={async () => {
                  const ret = await GetClusterDetail(r.objectMeta.name);
                  setModalData({
                    open: true,
                    mode: 'edit',
                    clusterDetail: ret.data,
                  });
                }}
                disabled={r.objectMeta.name === 'mgmt-cluster'}
              />
            </Tooltip>
            <Popconfirm
              placement="topRight"
              
              title={i18nInstance.t('30ee910e8ea18311b1b2efbea94333b8', {
                name: r.objectMeta.name,
              })}
              onConfirm={async () => {
                const ret = await DeleteCluster(r.objectMeta.name);
                if (ret.code === 200) {
                  await messageApi.success(
                    i18nInstance.t('fb09e53e96ff76a72894a816dd7c731c', {
                      name: r.objectMeta.name,
                    }),
                  );
                  await refetch();
                } else {
                  await messageApi.error(
                    i18nInstance.t(
                      '9e7856e9c5938b9200dbdc174e97cf8a',
                      '集群删除失败',
                    ),
                  );
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
              <Button size='middle' type="link" danger icon={<DeleteOutlined />} disabled={r.objectMeta.name === 'mgmt-cluster'} />
            </Popconfirm>
          </Space.Compact>
        );
      },
    },
  ];

  return (
    <Panel showSelectCluster={false}>
      <div className={'flex flex-row justify-between mb-4'}>
        <Input.Search
          placeholder={i18nInstance.t(
            'e8d235e76b8e310660e158dc4c2fd560',
            '按集群名称搜索',
          )}
          className={'w-[400px]'}
        />
        <Flex gap={8}>
          <Button
            type={'dashed'}
            icon={<Icons.build width={16} height={16} />}
            className="flex flex-row items-center"
            onClick={() => {
              setCapiModalOpen(true);
            }}
          >
            Create new
          </Button>
          <Button
            type={'primary'}
            icon={<Icons.add width={16} height={16} />}
            className="flex flex-row items-center"
            onClick={() => {
              setModalData({
                mode: 'create',
                open: true,
              });
            }}
          >
            Add existing
          </Button>
        </Flex>
      </div>
      <Table
        rowKey={(r: Cluster) => r.objectMeta.name || ''}
        columns={columns}
        loading={isLoading}
        dataSource={data?.clusters || []}
      />

      <NewClusterModal
        mode={clusterModalData.mode}
        open={clusterModalData.open}
        onOk={async (ret) => {
          if (ret.code === 200) {
            if (clusterModalData.mode === 'create') {
              await messageApi.success(
                i18nInstance.t(
                  'dca2754f7a646ef40f495f75145428d0',
                  '集群接入成功',
                ),
              );
            } else if (clusterModalData.mode === 'edit') {
              await messageApi.success(
                i18nInstance.t(
                  '474162cdce4e540d3a4d97c6de92cd68',
                  '集群更新成功',
                ),
              );
            }
            await refetch();
            setModalData({
              clusterDetail: undefined,
              mode: 'create',
              open: false,
            });
          } else {
            if (clusterModalData.mode === 'create') {
              await messageApi.error(
                i18nInstance.t(
                  '3b0b5df2e18ef97b7f948c60906a7821',
                  '集群接入失败',
                ),
              );
            } else if (clusterModalData.mode === 'edit') {
              await messageApi.error(
                i18nInstance.t(
                  '01812e386ab69ce4391769918e32d6d1',
                  '集群更新失败',
                ),
              );
            }
          }
        }}
        onCancel={() => {
          setModalData({
            clusterDetail: undefined,
            mode: 'create',
            open: false,
          });
        }}
        clusterDetail={clusterModalData.clusterDetail}
      />

      <ClusterUsersModal
        clusterName={usersModalData.clusterName}
        open={usersModalData.open}
        onClose={() => {
          setUsersModalData({
            open: false,
            clusterName: '',
          });
        }}
        onSuccess={() => {
          // Refetch cluster list after successful user updates
          refetch();
        }}
      />

      <CreateCAPIClusterModal
        open={capiModalOpen}
        onOk={async (ret) => {
          if (ret.code === 200) {
            await messageApi.success('Cluster creation initiated successfully');
            setCapiModalOpen(false);
            // Refetch cluster list
            refetch();
          } else {
            await messageApi.error(ret.message || 'Failed to create cluster');
          }
        }}
        onCancel={() => {
          setCapiModalOpen(false);
        }}
      />

      {messageContextHolder}
    </Panel>
  );
};
export default ClusterManagePage;