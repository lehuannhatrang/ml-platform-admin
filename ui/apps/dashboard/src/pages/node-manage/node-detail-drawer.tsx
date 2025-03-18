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
import { FC, useMemo } from 'react';
import {
  Drawer,
  Card,
  Statistic,
  Table,
  TableColumnProps,
  Typography,
  Tag,
  Row,
  Col,
  Button,
} from 'antd';
import { GetNodeDetail, GetNodePods } from '@/services/node.ts';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import styles from './index.module.less';
import { cn } from '@/utils/cn';
import TagList, { convertLabelToTags } from '@/components/tag-list';
import { calculateDuration } from '@/utils/time.ts';
import { PodDetail } from '@/services/workload';
import { useNavigate } from 'react-router-dom';

export interface NodeDetailDrawerProps {
  open: boolean;
  name: string;
  onClose: () => void;
  clusterName: string;
}

const NodeDetailDrawer: FC<NodeDetailDrawerProps> = (props) => {
  const { open, name, onClose, clusterName } = props;

  const navigate = useNavigate();

  const enableFetch = useMemo(() => {
    return !!(name && clusterName);
  }, [name, clusterName]);

  const { data: detailData, isLoading: isDetailDataLoading } = useQuery({
    queryKey: ['GetNodeDetail', name, clusterName],
    queryFn: async () => {
      const workloadDetailRet = await GetNodeDetail({
        name,
        clusterName,
      });
      return workloadDetailRet.data || {};
    },
    enabled: enableFetch,
  });
  
  const { data: podsData } = useQuery({
    queryKey: ['GetNodePods', name, clusterName],
    queryFn: async () => {
      const workloadPodsRet = await GetNodePods({
        name,
        clusterName,
      });
      return workloadPodsRet.data || {};
    },
    enabled: enableFetch,
  });

  const columns: TableColumnProps<PodDetail>[] = [
    {
      title: 'Name',
      key: 'name',
      render: (_, r) => {
        return r.metadata.name;
      },
    },
    {
      title: 'Namespace',
      key: 'namespace',
      width: 150,
      render: (_, r) => {
        return r.metadata.namespace;
      },
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, r) => {
        return <Tag color={r.status?.phase === 'Running' ? "green" : 'orange'}>{r.status?.phase}</Tag>
      },
    },
    {
      title: 'Age',
      key: 'age',
      width: 100,
      render: (_, r) => {
        return calculateDuration(r.metadata.creationTimestamp)
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: PodDetail) => (
          <Button
              type="link"
              onClick={() => {
                  navigate(`/multicloud-resource-manage/pod?action=view&name=${record.metadata?.name}&namespace=${record.metadata?.namespace}&cluster=${clusterName}`);
              }}
          >
              {i18nInstance.t('View Details')}
          </Button>
      ),
  },
  ];

  return (
    <Drawer
      title={`Node Details: ${name}`}
      placement="right"
      open={open}
      width={800}
      loading={isDetailDataLoading}
      onClose={onClose}
    >
      <Card title={'Node information'} bordered>
        <Row gutter={[16, 24]} className='mb-4'>
          <Col span={16}>
            <Statistic
              className={styles['no-value']}
              title={i18nInstance.t('d7ec2d3fea4756bc1642e0f10c180cf5', '名称')}
              prefix={
                <Typography.Text
                  ellipsis={{
                    tooltip: detailData?.objectMeta?.name || '-',
                  }}
                  style={{ textWrap: 'wrap' }}
                >
                  {detailData?.objectMeta?.name || '-'}
                </Typography.Text>
              }
            />
          </Col>
          

          <Col span={8}>
            <Statistic
              title={i18nInstance.t(
                'eca37cb0726c51702f70c486c1c38cf3',
                '创建时间',
              )}
              value={
                detailData?.objectMeta?.creationTimestamp
                  ? dayjs(detailData?.objectMeta?.creationTimestamp).format(
                      'YYYY-MM-DD',
                    )
                  : '-'
              }
            />
          </Col>

          <Col span={8}>
            <Statistic
              title={i18nInstance.t(
                '4a6341a8bcc68e0b7120dbc89014b6a2',
                '持续时间',
              )}
              value={calculateDuration(detailData?.objectMeta?.creationTimestamp)}
            />
          </Col>

          <Col span={8}>
            <Statistic
              title='OS'
              value={
                `${detailData?.status?.nodeInfo.operatingSystem || '-'}/${
                  detailData?.status?.nodeInfo.architecture || '-'
                }`
              }
            />
          </Col>

          <Col span={8}>
            <Statistic
              title='OS Image'
              value={
                detailData?.status?.nodeInfo.osImage || '-'
              }
            />
          </Col>

          <Col span={8}>
            <Statistic
              title='Container runtime'
              value={detailData?.status?.nodeInfo.containerRuntimeVersion || '-'}
            />
          </Col>

          <Col span={8}>
            <Statistic
              title='Kubelet version'
              value={detailData?.status?.nodeInfo.kubeletVersion || '-'}
            />
          </Col>

          <Col span={8}>
            <Statistic
              title='Addresses'
              valueRender={() => (
                <TagList
                  tags={detailData?.status?.addresses?.map((item) => ({
                    key: item.type,
                    value: `${item.type}: ${item.address}`,
                  })) || []}
                />
              )}
            />
          </Col>
        </Row>

        <div className="mb-4">
          <div className="text-base text-gray-500 mb-2">
            {i18nInstance.t('14d342362f66aa86e2aa1c1e11aa1204', '标签')}
          </div>
          <div>
            <TagList
              tags={convertLabelToTags(
                detailData?.objectMeta?.name || '',
                detailData?.objectMeta?.labels,
              )}
            />
          </div>
        </div>
        <div>
          <div className="text-base text-gray-500 mb-2">
            {i18nInstance.t('c11db1c192a765494c8859d854199085', '注解')}
          </div>
          <div>
            <TagList
              tags={convertLabelToTags(
                detailData?.objectMeta?.name || '',
                detailData?.objectMeta?.annotations,
              )}
            />
          </div>
        </div>
      </Card>
      <Card
        title={'Pods running'}
        bordered
        className={cn(styles['schedule-container'], 'mt-[6px]')}
      >
        <Table
          rowKey={(e) => e.metadata.uid}
          columns={columns}
          dataSource={podsData?.items || []}
        />
      </Card>
    </Drawer>
  );
};

export default NodeDetailDrawer;
