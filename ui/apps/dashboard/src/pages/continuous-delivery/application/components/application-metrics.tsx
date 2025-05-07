import React from 'react';
import { Card, Statistic, Row, Col, Progress, Tooltip } from 'antd';
import { CheckCircleOutlined, WarningOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { ArgoApplication } from '@/services/argocd';

interface ApplicationMetricsProps {
  application?: ArgoApplication;
}

interface Resource {
  kind: string;
  name: string;
  namespace: string;
  status: string;
  health?: {
    status: string;
    message?: string;
  };
}

const ApplicationMetrics: React.FC<ApplicationMetricsProps> = ({ application }) => {
  if (!application?.status?.resources) {
    return null;
  }

  // Calculate metrics based on resources
  const resources = application.status.resources || [];
  const resourceCount = resources.length;
  
  // Count resources by sync status
  const syncedCount = resources.filter((r: Resource) => r.status === 'Synced').length;
  const outOfSyncCount = resources.filter((r: Resource) => r.status === 'OutOfSync').length;
  const unknownSyncCount = resourceCount - syncedCount - outOfSyncCount;
  
  // Count resources by health status
  const healthyCount = resources.filter((r: Resource) => r.health?.status === 'Healthy').length;
  const degradedCount = resources.filter((r: Resource) => r.health?.status === 'Degraded').length;
  const progressingCount = resources.filter((r: Resource) => r.health?.status === 'Progressing').length;
  const suspendedCount = resources.filter((r: Resource) => r.health?.status === 'Suspended').length;
  const unknownHealthCount = resourceCount - healthyCount - degradedCount - progressingCount - suspendedCount;
  
  // Calculate percentages
  const syncedPercent = resourceCount > 0 ? Math.round((syncedCount / resourceCount) * 100) : 0;
  const healthyPercent = resourceCount > 0 ? Math.round((healthyCount / resourceCount) * 100) : 0;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12}>
        <Card title="Sync Status">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Tooltip title={`${syncedCount} of ${resourceCount} resources are synced`}>
                <Progress
                  type="circle"
                  percent={syncedPercent}
                  success={{ percent: syncedPercent }}
                  status={syncedPercent === 100 ? "success" : "normal"}
                />
              </Tooltip>
            </Col>
            <Col span={12}>
              <Statistic 
                title="Synced" 
                value={syncedCount} 
                suffix={`/${resourceCount}`} 
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />} 
              />
              {outOfSyncCount > 0 && (
                <Statistic 
                  title="Out of Sync" 
                  value={outOfSyncCount} 
                  valueStyle={{ color: '#faad14' }}
                  prefix={<WarningOutlined />} 
                />
              )}
              {unknownSyncCount > 0 && (
                <Statistic 
                  title="Unknown" 
                  value={unknownSyncCount} 
                  valueStyle={{ color: '#d9d9d9' }}
                  prefix={<ExclamationCircleOutlined />} 
                />
              )}
            </Col>
          </Row>
        </Card>
      </Col>
      
      <Col xs={24} sm={12}>
        <Card title="Health Status">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Tooltip title={`${healthyCount} of ${resourceCount} resources are healthy`}>
                <Progress
                  type="circle"
                  percent={healthyPercent}
                  success={{ percent: healthyPercent }}
                  status={healthyPercent === 100 ? "success" : "normal"}
                />
              </Tooltip>
            </Col>
            <Col span={12}>
              <Statistic 
                title="Healthy" 
                value={healthyCount} 
                suffix={`/${resourceCount}`} 
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />} 
              />
              {degradedCount > 0 && (
                <Statistic 
                  title="Degraded" 
                  value={degradedCount} 
                  valueStyle={{ color: '#f5222d' }}
                  prefix={<ExclamationCircleOutlined />} 
                />
              )}
              {progressingCount > 0 && (
                <Statistic 
                  title="Progressing" 
                  value={progressingCount} 
                  valueStyle={{ color: '#1890ff' }}
                  prefix={<ClockCircleOutlined />} 
                />
              )}
              {suspendedCount > 0 && (
                <Statistic 
                  title="Suspended" 
                  value={suspendedCount} 
                  valueStyle={{ color: '#faad14' }}
                  prefix={<WarningOutlined />} 
                />
              )}
              {unknownHealthCount > 0 && (
                <Statistic 
                  title="Unknown" 
                  value={unknownHealthCount} 
                  valueStyle={{ color: '#d9d9d9' }}
                  prefix={<ExclamationCircleOutlined />} 
                />
              )}
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default ApplicationMetrics;
