import React from 'react';
import { Drawer, Descriptions, Tag, Typography, Button, Divider, Space, Alert, message } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { ArgoApplication, SyncArgoApplication } from '@/services/argocd';
import { calculateDuration } from '@/utils/time';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

interface ApplicationInfoDrawerProps {
  open: boolean;
  application?: ArgoApplication;
  onClose: () => void;
}

export const getSyncStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'synced':
      return 'green';
    case 'outofsynced':
    case 'outofdate':
      return 'orange';
    case 'failed':
      return 'red';
    default:
      return 'default';
  }
};

export const getHealthStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'healthy':
      return 'green';
    case 'degraded':
      return 'red';
    case 'progressing':
      return 'blue';
    case 'suspended':
      return 'orange';
    default:
      return 'default';
  }
};

const ApplicationInfoDrawer: React.FC<ApplicationInfoDrawerProps> = ({
  open,
  application,
  onClose
}) => {
  if (!application) {
    return null;
  }

  const navigate = useNavigate();

  const handleSync = async () => {
    // TODO: Implement sync functionality
    console.log('Syncing application:', application.metadata?.name);
    const response = await SyncArgoApplication(application.metadata?.labels?.cluster || '', application.metadata?.name);
    if (response.code === 200) {
      message.success('Application sync started successfully');
    } else {
      message.error(response.message || 'Failed to sync application');
    }
  };

  const handleNavigate = (resource: { kind: string; name: string; namespace: string, cluster: string }) => {
    const { kind, name, namespace, cluster } = resource;
    const workloadsKind = ['Deployment', 'StatefulSet', 'DaemonSet'];
    const servicesKind = ['Service', 'Ingress'];
    if (workloadsKind.includes(kind)) {
      navigate(`/multicloud-resource-manage/${kind.toLowerCase()}?action=view&name=${name}&namespace=${namespace}&cluster=${cluster}`);
    } else if (servicesKind.includes(kind)) {
      navigate(`/multicloud-service-manage/${kind.toLowerCase()}?action=view&name=${name}&namespace=${namespace}&cluster=${cluster}`);
    }
  };

  return (
    <Drawer
      title={`Application: ${application.metadata?.name}`}
      placement="right"
      width={700}
      onClose={onClose}
      open={open}
      extra={
        <Space>
          <Button
            icon={<SyncOutlined />}
            onClick={handleSync}
            title="Sync application"
          >
            Sync
          </Button>
        </Space>
      }
    >

      {application.status?.conditions && application.status.conditions.length > 0 && (
        <>
          {application.status.conditions.map((condition: { type: string; status: string; message: string }, _index: number) => (
            <Alert
              message={condition.type}
              description={condition.message}
              type={condition.type?.toLowerCase().includes('error') ? 'error' : 'warning'}
              showIcon
              className='mb-3'
            />
          ))}

        </>
      )}

      <Descriptions
        title="Application Details"
        column={2}
        bordered
        size="small"
      >
        <Descriptions.Item label="Name">
          {application.metadata?.name}
        </Descriptions.Item>
        <Descriptions.Item label="Namespace">
          {application.metadata?.namespace || 'argocd'}
        </Descriptions.Item>
        <Descriptions.Item label="Project">
          {application.spec?.project}
        </Descriptions.Item>
        <Descriptions.Item label="Cluster">
          {application.metadata?.labels?.cluster || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Created">
          {calculateDuration(application.metadata?.creationTimestamp)}
        </Descriptions.Item>
        <Descriptions.Item label="UID">
          <Text copyable>{application.metadata?.uid}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Sync Status">
          <Tag color={getSyncStatusColor(application.status?.sync?.status || '')}>
            {application.status?.sync?.status || 'Unknown'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Health Status">
          <Tag color={getHealthStatusColor(application.status?.health?.status || '')}>
            {application.status?.health?.status || 'Unknown'}
          </Tag>
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">Source</Divider>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="Repository URL">
          <Text copyable>{application.spec?.source?.repoURL}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Path">
          {application.spec?.source?.path}
        </Descriptions.Item>
        <Descriptions.Item label="Target Revision">
          {application.spec?.source?.targetRevision || 'HEAD'}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">Destination</Divider>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="Server">
          <Text copyable>{application.spec?.destination?.server}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Namespace">
          {application.spec?.destination?.namespace}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">Sync Policy</Divider>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="Automated">
          {application.spec?.syncPolicy?.automated ? (
            <Tag color="green">Enabled</Tag>
          ) : (
            <Tag color="default">Disabled</Tag>
          )}
        </Descriptions.Item>
        {application.spec?.syncPolicy?.automated && (
          <>
            <Descriptions.Item label="Prune">
              {application.spec?.syncPolicy?.automated?.prune ? (
                <Tag color="green">Enabled</Tag>
              ) : (
                <Tag color="default">Disabled</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Self Heal">
              {application.spec?.syncPolicy?.automated?.selfHeal ? (
                <Tag color="green">Enabled</Tag>
              ) : (
                <Tag color="default">Disabled</Tag>
              )}
            </Descriptions.Item>
          </>
        )}
      </Descriptions>

      {application.status?.resources && application.status.resources.length > 0 && (
        <>
          <Divider orientation="left">Resources</Divider>
          <Descriptions bordered size="small" column={1}>
            {application.status.resources.map((resource: {
              kind: string;
              name: string;
              namespace: string;
              status: string;
              health?: {
                status: string;
              }
            }, index: number) => (
              <Descriptions.Item
                key={index}
                label={<Button 
                  type="link" 
                  onClick={() => handleNavigate({ ...resource, cluster: application.metadata.labels?.cluster || '' })}>
                    {`${resource.kind} / ${resource.name}`}
                  </Button>
                }
              >
                <Space direction="vertical">
                  <div>Namespace: {resource.namespace}</div>
                  <div>
                    Status:
                    <Tag
                      color={resource.status === 'Synced' ? 'green' : 'orange'}
                      style={{ marginLeft: 8 }}
                    >
                      {resource.status || 'Unknown'}
                    </Tag>
                  </div>
                  {resource.health && (
                    <div>
                      Health:
                      <Tag
                        color={getHealthStatusColor(resource.health.status || '')}
                        style={{ marginLeft: 8 }}
                      >
                        {resource.health.status || 'Unknown'}
                      </Tag>
                    </div>
                  )}
                </Space>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </>
      )}
    </Drawer>
  );
};

export default ApplicationInfoDrawer;
