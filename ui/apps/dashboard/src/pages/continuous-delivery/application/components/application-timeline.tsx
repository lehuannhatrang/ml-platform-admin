import React from 'react';
import { Card, Timeline, Tag, Typography, Empty } from 'antd';
import { 
  SyncOutlined, 
  CheckCircleOutlined, 
  WarningOutlined,
  ClockCircleOutlined, 
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { ArgoApplication } from '@/services/argocd';
import { calculateDuration } from '@/utils/time';

const { Text } = Typography;

interface ApplicationTimelineProps {
  application?: ArgoApplication;
}

const ApplicationTimeline: React.FC<ApplicationTimelineProps> = ({ application }) => {
  if (!application?.status?.history || application.status.history.length === 0) {
    return (
      <Card title="Application History">
        <Empty description="No history data available" />
      </Card>
    );
  }

  // Sort history items by most recent first
  const sortedHistory = [...(application.status.history || [])].sort((a, b) => {
    const dateA = new Date(a.deployedAt || '');
    const dateB = new Date(b.deployedAt || '');
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <Card title="Application History">
      <Timeline
        mode="left"
        items={sortedHistory.map(item => {
          // Determine icon based on operation status
          let dotColor = 'gray';
          let icon = <ClockCircleOutlined />;
          
          if (item.status === 'Succeeded' || item.status === 'Synced') {
            dotColor = 'green';
            icon = <CheckCircleOutlined />;
          } else if (item.status === 'Failed') {
            dotColor = 'red';
            icon = <ExclamationCircleOutlined />;
          } else if (item.status === 'Running') {
            dotColor = 'blue';
            icon = <SyncOutlined spin />;
          } else if (item.status === 'Error') {
            dotColor = 'orange';
            icon = <WarningOutlined />;
          }
          
          return {
            color: dotColor,
            dot: icon,
            children: (
              <div>
                <div style={{ marginBottom: 4 }}>
                  <Text strong>Revision: </Text>
                  <Text code>{item.revision || 'Unknown'}</Text>
                  {item.status && (
                    <Tag
                      color={
                        item.status === 'Succeeded' || item.status === 'Synced'
                          ? 'green'
                          : item.status === 'Failed' || item.status === 'Error'
                          ? 'red'
                          : item.status === 'Running'
                          ? 'blue'
                          : 'default'
                      }
                      style={{ marginLeft: 8 }}
                    >
                      {item.status}
                    </Tag>
                  )}
                </div>
                
                {item.deployedAt && (
                  <div>
                    <Text type="secondary">
                      Deployed {calculateDuration(item.deployedAt)} ({new Date(item.deployedAt).toLocaleString()})
                    </Text>
                  </div>
                )}
                
                {item.message && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ wordBreak: 'break-word' }}>
                      {item.message}
                    </Text>
                  </div>
                )}
              </div>
            ),
          };
        })}
      />
    </Card>
  );
};

export default ApplicationTimeline;
