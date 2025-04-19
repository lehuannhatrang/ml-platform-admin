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

import {
  Card,
  Col,
  Empty,
  Flex,
  Popconfirm,
  Row,
  Spin,
  message,
} from 'antd';

import { GaugeChart } from '@/components/chart';
import { GetOverview, MetricsDashboard } from '@/services/overview.ts';
import { InfoCard, SectionCard } from '@/components/cards';
import Panel from '@/components/panel';
import i18nInstance from '@/utils/i18n';
import { useQuery } from '@tanstack/react-query';
import { GetClusters } from '@/services';
import { Icons } from '@/components/icons';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import NewDashboardModal from './new-dashboard-modal';
import { DeleteMonitoringDashboard } from '@/services/monitoring-config';
import { useCluster } from '@/hooks';
import { DEFAULT_CLUSTER_OPTION } from '@/hooks/use-cluster';

const Overview = () => {
  const { clusterOptions, selectedCluster, setSelectedCluster } = useCluster({})

  const { data, isLoading } = useQuery({
    queryKey: ['GetOverview', selectedCluster],
    queryFn: async () => {
      const ret = await GetOverview(selectedCluster);
      return ret.data;
    },
    refetchInterval: 5000,
  });

  const { data: metricsDashboards, refetch: refetchDashboards } = useQuery({
    queryKey: ['GetMetricsDashboards'],
    queryFn: async () => {
      const ret = await GetOverview(DEFAULT_CLUSTER_OPTION);
      return ret.data.metricsDashboards;
    },
  });

  const { data: clusters } = useQuery({
    queryKey: ['GetClusters'],
    queryFn: async () => {
      const ret = await GetClusters();
      return ret.data;
    },
  });

  const navigate = useNavigate();

  const [selectedDashboard, setSelectedDashboard] = useState<MetricsDashboard | null>(null);
  const [isNewDashboardModalOpen, setIsNewDashboardModalOpen] = useState(false);

  useEffect(() => {
    if ((metricsDashboards?.length || 0) > 0) {
      setSelectedDashboard(metricsDashboards?.[0] || null);
    }
  }, [metricsDashboards]);

  const { allocatedCPU, totalCPU } = data?.memberClusterStatus?.cpuSummary || {};
  const { allocatedMemory, totalMemory } = data?.memberClusterStatus?.memorySummary || {};
  const allocatedMemoryGiB = allocatedMemory && allocatedMemory / (1024 * 1024 * 1024);
  const totalMemoryGiB = totalMemory && totalMemory / (1024 * 1024 * 1024);

  const handleDeleteDashboard = async () => {
    if (!selectedDashboard) return;

    try {
      await DeleteMonitoringDashboard({
        name: selectedDashboard.name,
        url: selectedDashboard.url,
      });

      message.success('Dashboard deleted successfully');

      // Refresh overview data
      refetchDashboards();

      // Reset selected dashboard if it was deleted
      if (selectedDashboard) {
        const newActiveKey = metricsDashboards?.find(d => d.name !== selectedDashboard.name)?.name || 'add-new-dashboard';
        setSelectedDashboard(metricsDashboards?.find(d => d.name === newActiveKey) || null);
      }
    } catch (error: any) {
      message.error(error?.message || 'Failed to delete dashboard');
    }
  };

  return (
    <Spin spinning={isLoading}>
      <Panel>
        {clusterOptions.length > 1 ? (
          <>
            <Card
              title="Information"
              tabList={clusterOptions.map(option => ({
                label: option.label,
                key: option.value,
              }))}
              activeTabKey={selectedCluster.value}
              onTabChange={(key) => {
                console.log('key', key);
                setSelectedCluster(clusterOptions.find(option => option.value === key) || clusterOptions[0]);
              }}
              tabProps={{
                type: 'card',
              }}
              className="mb-8"
            >
              <Row gutter={32}>
                <Col span={12}>
                  <Row gutter={32} className="mb-8">
                    {selectedCluster.value === 'ALL' ? <Col span={8}>
                      <InfoCard
                        label={'Cluster'}
                        value={clusters?.clusters.length || '-'}
                        hoverable={true}
                        onClick={() => navigate('/cluster-manage')}
                      />
                    </Col> : <Col span={8}>
                      <InfoCard
                        label='Namespace'
                        value={data?.namespaceCount || '-'}
                        hoverable={true}
                        onClick={() => navigate('/namespace')}
                      />
                    </Col>
                    }
                    <Col span={8}>
                      <InfoCard
                        label={'Node'}
                        value={`${data?.memberClusterStatus?.nodeSummary?.readyNum || '-'
                          }/${data?.memberClusterStatus?.nodeSummary?.totalNum || '-'}`}
                        hoverable={true}
                        onClick={() => navigate('/node-manage')}
                      />
                    </Col>
                    <Col span={8}>
                      <InfoCard
                        label='Application'
                        value={data?.argoMetrics?.applicationCount || '-'}
                        hoverable={true}
                        onClick={() => navigate('/continuous-delivery/application')}
                      />
                    </Col>
                  </Row>
                  <Row gutter={32}>
                    <Col span={8}>
                      <InfoCard
                        label='Project'
                        value={data?.argoMetrics?.projectCount || '-'}
                        hoverable={true}
                        onClick={() => navigate('/continuous-delivery/project')}
                      />
                    </Col>
                    <Col span={8}>
                      <InfoCard
                        label={'Pod'}
                        value={data?.memberClusterStatus?.podSummary?.allocatedPod || '-'}
                        hoverable={true}
                        onClick={() => navigate('/multicloud-resource-manage/pod')}
                      />
                    </Col>
                    {selectedCluster.value === 'ALL' ? <Col span={8}>
                      <InfoCard
                        label={i18nInstance.t(
                          '66e8579fa53a0cdf402e882a3574a380',
                          'Karmada版本',
                        )}
                        value={data?.karmadaInfo.version.gitVersion || '-'}
                      />
                    </Col> : <Col span={8}>
                      <InfoCard
                        label='Deployment'
                        value={data?.deploymentCount || '-'}
                        hoverable={true}
                        onClick={() => navigate('/multicloud-resource-manage/deployment')}
                      />
                    </Col>}
                  </Row>
                </Col>
                <Col span={12}>
                  <Row gutter={32}>
                    <Col span={12}>
                      <Row>
                        <b style={{ fontSize: 16 }}>
                          {i18nInstance.t(
                            'a1dacced95ddca3603110bdb1ae46af1',
                            'CPU使用情况',
                          )} (Core)
                        </b>
                      </Row>
                      <Row>
                        {totalCPU && allocatedCPU && (
                          <GaugeChart

                            data={{
                              target: allocatedCPU,
                              total: totalCPU,
                              name: 'CPU',
                              thresholds: [
                                totalCPU / 4,
                                totalCPU / 2,
                                (3 * totalCPU) / 4,
                                totalCPU,
                              ],
                            }}
                            config={{
                              height: 300,
                              style: {
                                textContent: (target: number, total: number) =>
                                  total ? `${(Number((target / total).toFixed(4)) * 100).toFixed(2)}%` : '-'
                              },
                            }}
                          />
                        )}
                      </Row>
                    </Col>
                    <Col span={12}>
                      <Row>
                        <b style={{ fontSize: 16 }}>
                          {i18nInstance.t(
                            '5eaa09de6e55b322fcc299f641d73ce7',
                            'Memory使用情况',
                          )} (GiB)
                        </b>
                      </Row>
                      <Row>
                        {totalMemoryGiB && allocatedMemoryGiB && (
                          <GaugeChart
                            data={{
                              target: allocatedMemoryGiB,
                              total: totalMemoryGiB,
                              name: 'Memory',
                              thresholds: [
                                totalMemoryGiB / 4,
                                totalMemoryGiB / 2,
                                (3 * totalMemoryGiB) / 4,
                                totalMemoryGiB,
                              ],
                            }}
                            config={{
                              height: 300,
                              style: {
                                textContent: (target: number, total: number) =>
                                  total ? `${(Number((target / total).toFixed(4)) * 100).toFixed(2)}%` : '-'
                              },
                            }}
                          />
                        )}
                      </Row>
                    </Col>
                  </Row>
                </Col>
              </Row>
            </Card>

            <SectionCard
              title='Monitoring'
              extra={(
                <a href='/basic-config/monitoring-config' style={{ fontSize: 20, color: '#1890ff' }}>
                  <SettingOutlined />
                </a>
              )}
              tabList={[
                ...(metricsDashboards?.map((dashboard: MetricsDashboard) => ({
                  label: dashboard.name,
                  key: dashboard.name,
                  closable: false,
                })) || []),
              ]}
              tabProps={{
                type: 'editable-card',
                addIcon: <Flex className='text-blue-500'>
                  <PlusOutlined className='mr-2' />
                  <span>Add Dashboard</span>
                </Flex>,
                onEdit: (_e: any, action: 'add' | 'remove') => {
                  if (action === 'add') {
                    setIsNewDashboardModalOpen(true);
                  }
                },
              }}
              activeTabKey={selectedDashboard?.name || ''}
              onTabChange={(key: string) => {
                if (key === 'add-new-dashboard') {
                  setIsNewDashboardModalOpen(true);
                } else {
                  setSelectedDashboard(metricsDashboards?.find((dashboard: MetricsDashboard) => dashboard.name === key) || null)
                }
              }}
            >
              {selectedDashboard ? (
                <>
                  <Flex justify='space-between' className='mb-4'>
                    <a href={selectedDashboard.url} target='_blank' rel="noreferrer" style={{ color: '#1890ff', display: 'flex', fontSize: 16 }}>
                      Grafana
                      <Icons.newTab style={{ height: 20 }} />
                    </a>
                    <Popconfirm
                      className='ml-4'
                      placement="topRight"
                      title={`Do you want to remove "${selectedDashboard.name}" dashboard?`}
                      onConfirm={handleDeleteDashboard}
                      okText={i18nInstance.t(
                        'e83a256e4f5bb4ff8b3d804b5473217a',
                        '确认',
                      )}
                      cancelText={i18nInstance.t(
                        '625fb26b4b3340f7872b411f401e754c',
                        '取消',
                      )}
                    >
                      <Icons.trash style={{ height: 20, cursor: 'pointer', color: '#F4664A' }} />
                    </Popconfirm>
                  </Flex>
                  <iframe
                    src={`${selectedDashboard.url}${selectedDashboard.url.includes('?') ? '&' : '?'}theme=light&kiosk`}
                    width="100%"
                    height="auto"
                    style={{ fontSize: '16px', overflow: 'hidden', minHeight: '1800px' }}
                  ></iframe>
                </>
              ) : <Empty description="No monitoring dashboard found, please add one." />}
            </SectionCard>
          </>
        ) : (
          <Flex justify="center" align="center" style={{ height: '800px' }}>
            <Empty description="No clusters available" />
          </Flex>
        )}
      </Panel>

      <NewDashboardModal
        open={isNewDashboardModalOpen}
        onCancel={() => setIsNewDashboardModalOpen(false)}
        onSuccess={() => {
          setIsNewDashboardModalOpen(false);
          // Refetch data after adding a new dashboard
          refetchDashboards();
        }}
      />
    </Spin>
  );
};

export default Overview;
