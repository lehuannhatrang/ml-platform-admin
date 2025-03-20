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
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { cn } from '@/utils/cn';
import TagList, { convertLabelToTags } from '@/components/tag-list';
import { calculateDuration } from '@/utils/time.ts';
import { GetMemberResource } from '@/services/unstructured.ts';
import styles from '../index.module.less';

export type IngressInfoDrawerProps = {
  open: boolean;
  namespace: string;
  name: string;
  cluster: string;
  onClose: () => void;
};

const IngressInfoDrawer: FC<IngressInfoDrawerProps> = (props) => {
  const { open, namespace, name, onClose, cluster } = props;

  const enableFetch = useMemo(() => {
    return !!(name && namespace && cluster);
  }, [name, namespace, cluster]);

  const { data: detailData, isLoading: isDetailDataLoading } = useQuery({
    queryKey: ['GetIngressDetail', cluster, name, namespace],
    queryFn: async () => {
      const response = await GetMemberResource({
        kind: 'Ingress',
        name,
        namespace,
        cluster,
      });
      return response?.data || {};
    },
    enabled: enableFetch && open,
  });

  const ruleColumns: TableColumnProps<any>[] = [
    {
      title: 'Host',
      key: 'host',
      dataIndex: 'host',
      render: (host: string) => host || '*',
    },
    {
      title: 'Path',
      key: 'path',
      dataIndex: ['http', 'paths'],
      render: (paths: any[]) => {
        return paths?.map((p) => {
          const pathType = p.pathType ? `(${p.pathType})` : '';
          return `${p.path || '/'} ${pathType}`;
        }).join(', ') || '-';
      },
    },
    {
      title: 'Backend',
      key: 'backend',
      dataIndex: ['http', 'paths'],
      render: (paths: any[]) => {
        return paths?.map((p) => {
          if (p.backend?.service) {
            const service = p.backend.service;
            return `${service.name}:${service.port?.number || service.port?.name || ''}`;
          }
          return '-';
        }).join(', ') || '-';
      },
    },
  ];

  const tlsColumns: TableColumnProps<any>[] = [
    {
      title: 'Hosts',
      key: 'hosts',
      dataIndex: 'hosts',
      render: (hosts: string[]) => hosts?.join(', ') || '*',
    },
    {
      title: 'Secret Name',
      key: 'secretName',
      dataIndex: 'secretName',
    },
  ];

  const ingressData = detailData as any;
  
  // Extract rules and tls from the specs
  const rules = ingressData?.spec?.rules || [];
  const tls = ingressData?.spec?.tls || [];

  return (
    <Drawer
      title={`INGRESS: ${name}`}
      placement="right"
      open={open}
      width={800}
      loading={isDetailDataLoading}
      onClose={onClose}
    >
      <Card title="Information" bordered>
        <Row gutter={[16, 24]}>
          <Col span={16}>
            <Statistic
              className={styles['no-value']}
              title={i18nInstance.t('d7ec2d3fea4756bc1642e0f10c180cf5', '名称')}
              prefix={
                <Typography.Text
                  ellipsis={{
                    tooltip: ingressData?.metadata?.name || '-',
                  }}
                  style={{ textWrap: 'wrap' }}
                >
                  {ingressData?.metadata?.name || '-'}
                </Typography.Text>
              }
            />
          </Col>
          <Col span={8}>
            <Statistic title="Cluster" value={cluster || '-'} />
          </Col>
          <Col span={8}>
            <Statistic
              className={styles['no-value']}
              title={i18nInstance.t('70e6882e567e3dbc86df3ef2fb2f65e4', '资源UID')}
              prefix={
                <Typography.Text
                  ellipsis={{
                    tooltip: ingressData?.metadata?.uid || '-',
                  }}
                  style={{ textWrap: 'wrap' }}
                >
                  {ingressData?.metadata?.uid || '-'}
                </Typography.Text>
              }
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={i18nInstance.t('a4b28a416f0b6f3c215c51e79e517298', '命名空间')}
              value={ingressData?.metadata?.namespace || '-'}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={i18nInstance.t('eca37cb0726c51702f70c486c1c38cf3', '创建时间')}
              value={
                ingressData?.metadata?.creationTimestamp
                  ? dayjs(ingressData?.metadata?.creationTimestamp).format('YYYY-MM-DD')
                  : '-'
              }
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={i18nInstance.t('4a6341a8bcc68e0b7120dbc89014b6a2', '持续时间')}
              value={calculateDuration(ingressData?.metadata?.creationTimestamp)}
            />
          </Col>
          {ingressData?.status?.loadBalancer?.ingress && (
            <Col span={16}>
              <Statistic 
                title="Load Balancer" 
                value={ingressData.status.loadBalancer.ingress
                  .map((ing: any) => ing.ip || ing.hostname)
                  .filter(Boolean)
                  .join(', ') || '-'} 
              />
            </Col>
          )}
        </Row>

        <div className="mb-4 mt-4">
          <div className="text-base text-gray-500 mb-2">
            {i18nInstance.t('14d342362f66aa86e2aa1c1e11aa1204', '标签')}
          </div>
          <div>
            <TagList
              tags={convertLabelToTags(
                ingressData?.metadata?.name || '',
                ingressData?.metadata?.labels,
              )}
            />
          </div>
        </div>
        <div>
          <div className="text-base text-gray-500 mb-2">
            {i18nInstance.t('c11db1c192a765494c8859d854199085', '注解')}
          </div>
          <div className="overflow-hidden">
            <TagList
              tags={convertLabelToTags(
                ingressData?.metadata?.name || '',
                ingressData?.metadata?.annotations,
              )}
            />
          </div>
        </div>
      </Card>

      {rules.length > 0 && (
        <Card
          title="Rules"
          bordered
          className={cn(styles['schedule-container'], 'mt-[6px]')}
        >
          <Table
            rowKey={(_, index) => `rule-${index}`}
            columns={ruleColumns}
            pagination={false}
            dataSource={rules}
          />
        </Card>
      )}

      {tls.length > 0 && (
        <Card
          title="TLS"
          bordered
          className={cn(styles['schedule-container'], 'mt-[6px]')}
        >
          <Table
            rowKey={(_, index) => `tls-${index}`}
            columns={tlsColumns}
            pagination={false}
            dataSource={tls}
          />
        </Card>
      )}
    </Drawer>
  );
};

export default IngressInfoDrawer;
