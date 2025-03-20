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
import { Endpoint, ServicePort, ServiceRaw } from '@/services/service.ts';
import { GetMemberResource } from '@/services/unstructured.ts';
import styles from '../index.module.less';

export type ServiceInfoDrawerProps = {
  open: boolean;
  namespace: string;
  name: string;
  cluster: string;
  onClose: () => void;
};

const ServiceInfoDrawer: FC<ServiceInfoDrawerProps> = (props) => {
  const { open, namespace, name, onClose, cluster } = props;

  const enableFetch = useMemo(() => {
    return !!(name && namespace && cluster);
  }, [name, namespace, cluster]);

  const { data: detailData, isLoading: isDetailDataLoading } = useQuery({
    queryKey: ['GetServiceDetail', cluster, name, namespace],
    queryFn: async () => {
      const response = await GetMemberResource({
        kind: 'Service',
        name,
        namespace,
        cluster,
      });
      return response?.data || {};
    },
    enabled: enableFetch && open,
  });

  const servicePortsColumns: TableColumnProps<ServicePort>[] = [
    {
      title: 'Port',
      key: 'port',
      dataIndex: 'port',
    },
    {
      title: 'Protocol',
      key: 'protocol',
      dataIndex: 'protocol',
    },
    {
      title: 'Node Port',
      key: 'nodePort',
      dataIndex: 'nodePort',
      render: (nodePort: number) => nodePort || '-',
    },
  ];

  const endpointColumns: TableColumnProps<Endpoint>[] = [
    {
      title: 'Host',
      key: 'host',
      dataIndex: 'host',
    },
    {
      title: 'Ports',
      key: 'ports',
      dataIndex: 'ports',
      render: (ports: ServicePort[]) => {
        return ports?.map((p) => `${p.port}/${p.protocol}`).join(', ') || '-';
      },
    },
  ];

  const serviceData = detailData as ServiceRaw;
  console.log({ serviceData });
  return (
    <Drawer
      title={`SERVICE: ${name}`}
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
                    tooltip: serviceData?.metadata?.name || '-',
                  }}
                  style={{ textWrap: 'wrap' }}
                >
                  {serviceData?.metadata?.name || '-'}
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
                    tooltip: serviceData?.metadata?.uid || '-',
                  }}
                  style={{ textWrap: 'wrap' }}
                >
                  {serviceData?.metadata?.uid || '-'}
                </Typography.Text>
              }
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={i18nInstance.t('a4b28a416f0b6f3c215c51e79e517298', '命名空间')}
              value={serviceData?.metadata?.namespace || '-'}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={i18nInstance.t('eca37cb0726c51702f70c486c1c38cf3', '创建时间')}
              value={
                serviceData?.metadata?.creationTimestamp
                  ? dayjs(serviceData?.metadata?.creationTimestamp).format('YYYY-MM-DD')
                  : '-'
              }
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={i18nInstance.t('4a6341a8bcc68e0b7120dbc89014b6a2', '持续时间')}
              value={calculateDuration(serviceData?.metadata?.creationTimestamp)}
            />
          </Col>
          <Col span={8}>
            <Statistic title="Type" value={serviceData?.spec?.type || '-'} />
          </Col>
          <Col span={8}>
            <Statistic title="Cluster IP" value={serviceData?.spec?.clusterIP || '-'} />
          </Col>
        </Row>

        <div className="mb-4 mt-4">
          <div className="text-base text-gray-500 mb-2">
            {i18nInstance.t('14d342362f66aa86e2aa1c1e11aa1204', '标签')}
          </div>
          <div>
            <TagList
              tags={convertLabelToTags(
                serviceData?.metadata?.name || '',
                serviceData?.metadata?.labels,
              )}
            />
          </div>
        </div>
        <div className="mb-4 mt-4">
          <div className="text-base text-gray-500 mb-2">
            {i18nInstance.t('c11db1c192a765494c8859d854199085', '注解')}
          </div>
          <div className="overflow-hidden">
            <TagList
              tags={convertLabelToTags(
                serviceData?.metadata?.name || '',
                serviceData?.metadata?.annotations,
              )}
            />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-base text-gray-500 mb-2">
            Selector
          </div>
          <div className="overflow-hidden">
            <TagList
              tags={convertLabelToTags(
                serviceData?.metadata?.name || '',
                serviceData?.spec?.selector,
              )}
            />
          </div>
        </div>
      </Card>

      {serviceData?.spec?.ports && serviceData.spec.ports.length > 0 && (
        <Card
          title="Ports"
          bordered
          className={cn(styles['schedule-container'], 'mt-[6px]')}
        >
          <Table
            rowKey={(port) => `${port.port}-${port.protocol}`}
            columns={servicePortsColumns}
            pagination={false}
            dataSource={serviceData.spec.ports}
          />
        </Card>
      )}

      {serviceData?.status?.loadBalancer?.ingress && serviceData.status.loadBalancer.ingress.length > 0 && (
        <Card
          title="External Endpoints"
          bordered
          className={cn(styles['schedule-container'], 'mt-[6px]')}
        >
          <Table
            rowKey={(endpoint) => endpoint.host}
            columns={endpointColumns}
            pagination={false}
            dataSource={serviceData.status.loadBalancer.ingress}
          />
        </Card>
      )}
    </Drawer>
  );
};

export default ServiceInfoDrawer;
