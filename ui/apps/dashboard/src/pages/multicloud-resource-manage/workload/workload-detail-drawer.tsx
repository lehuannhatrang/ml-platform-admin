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
  Row,
  Col,
  Tag,
} from 'antd';
import {
  GetWorkloadDetail,
  GetWorkloadEvents,
  WorkloadEvent,
  ContainerStatuses,
} from '@/services/workload.ts';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import styles from './index.module.less';
import { WorkloadKind } from '@/services/base.ts';
import { cn } from '@/utils/cn';
import TagList, { convertLabelToTags } from '@/components/tag-list';
import { calculateDuration } from '@/utils/time.ts';

export interface WorkloadDetailDrawerProps {
  open: boolean;
  kind: WorkloadKind;
  namespace: string;
  name: string;
  cluster: string;
  onClose: () => void;
}

const WorkloadDetailDrawer: FC<WorkloadDetailDrawerProps> = (props) => {
  const { open, kind, namespace, name, onClose, cluster } = props;

  const enableFetch = useMemo(() => {
    return !!(kind && name && namespace && cluster);
  }, [kind, name, namespace, cluster]);

  const { data: detailData, isLoading: isDetailDataLoading } = useQuery({
    queryKey: ['GetWorkloadDetail', kind, cluster, name, namespace],
    queryFn: async () => {
      const workloadDetailRet = await GetWorkloadDetail({
        namespace,
        name,
        kind,
        cluster,
      });
      return workloadDetailRet.data || {};
    },
    enabled: enableFetch,
  });
  const { data: eventsData } = useQuery({
    queryKey: ['GetWorkloadEvents', kind, name, namespace],
    queryFn: async () => {
      const workloadEventsRet = await GetWorkloadEvents({
        namespace,
        name,
        kind,
        cluster,
      });
      return workloadEventsRet.data || {};
    },
    enabled: enableFetch,
  });

  const columns: TableColumnProps<WorkloadEvent>[] = [
    {
      title: i18nInstance.t('383a6d166f8f60e16e726ccc9c483631', '类别'),
      key: 'type',
      dataIndex: 'type',
    },
    {
      title: i18nInstance.t('26ca20b161c33362d88eb0ba0bc90751', '来源'),
      key: 'sourceComponent',
      dataIndex: 'sourceComponent',
    },
    {
      title: i18nInstance.t('03663386e7d82f847634a6ee9111a32b', '最后检测时间'),
      key: 'lastSeen',
      dataIndex: 'lastSeen',
    },
    {
      title: i18nInstance.t('41dfb0bf6167ca035b93caf3e06d6c95', '原因'),
      key: 'reason',
      dataIndex: 'reason',
    },
    {
      title: i18nInstance.t('d8c7e04c8e2be23dd3b81a31db6e04f1', '信息'),
      key: 'message',
      dataIndex: 'message',
    },
  ];
  
  const containerStatusColumns: TableColumnProps<ContainerStatuses>[] = [
    {
      title: 'Name',
      key: 'name',
      dataIndex: 'name',
    },
    {
      title: 'Image',
      key: 'image',
      dataIndex: 'image',
    },
    {
      title: 'Restart',
      key: 'restart',
      dataIndex: 'restartCount',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, r) => {
        return r.ready ? <Tag color="green">Ready</Tag> : <Tag color="red">Not Ready</Tag>;
      },
    },
  ];

  return (
    <Drawer
      title={i18nInstance.t('0af9d9af618327e912ac9f91bbe6a30f', '工作负载详情')}
      placement="right"
      open={open}
      width={800}
      loading={isDetailDataLoading}
      onClose={onClose}
    >
      <Card
        title='Information'
        bordered
      >
        <Row gutter={[16, 24]}>
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
              title='Cluster'
              value={cluster || '-'}
            />
          </Col>
          <Col span={16}>
            <Statistic
              className={styles['no-value']}
              title={i18nInstance.t(
                '70e6882e567e3dbc86df3ef2fb2f65e4',
                '资源UID',
              )}
              prefix={
                <Typography.Text
                  ellipsis={{
                    tooltip: detailData?.objectMeta?.uid || '-',
                  }}
                  style={{ textWrap: 'wrap' }}
                >
                  {detailData?.objectMeta?.uid || '-'}
                </Typography.Text>
              }
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={i18nInstance.t(
                'a4b28a416f0b6f3c215c51e79e517298',
                '命名空间',
              )}
              value={detailData?.objectMeta?.namespace || '-'}
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
          {detailData?.status && <Col span={8}>
            <Statistic
              title='Status'
              value={detailData?.status?.phase}
            />
          </Col>}
        </Row>

        <div className="mb-4 mt-4">
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
      {detailData?.status?.containerStatuses && (
        <Card
          title='Container Statuses'
          bordered
          className={cn(styles['schedule-container'], 'mt-[6px]')}
        >
          <Table
            rowKey={(e) => e.containerID}
            columns={containerStatusColumns}
            pagination={false}
            dataSource={detailData?.status?.containerStatuses || []}
          />
        </Card>
      )}

      <Card
        title={i18nInstance.t('be41a5333fef1e665214254aaf11f4fd', '调度信息')}
        bordered
        className={cn(styles['schedule-container'], 'mt-[6px]')}
      >
        <Table
          rowKey={(e) => e.objectMeta.uid}
          columns={columns}
          pagination={false}
          dataSource={eventsData?.events || []}
        />
      </Card>
    </Drawer>
  );
};

export default WorkloadDetailDrawer;
