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

import React, { useState } from 'react';
import {
  Button,
  Card,
  Space,
  Table,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Tag,
  Badge,
  Tabs,
  Typography,
  Tooltip,
  Switch,
  Row,
  Col,
  Statistic
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined,
  EyeOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  createRecovery, 
  getBackups,
  getClusters,
  getCheckpointRestoreEvents,
  type CreateRecoveryRequest,
  type CheckpointRestoreEvent
} from '@/services/backup-recovery';

const { Option } = Select;
const { Title, Text } = Typography;

// Recovery Policy interface
interface RecoveryPolicy {
  id: string;
  name: string;
  description: string;
  sourceCluster: string;
  targetCluster: string;
  resourceType: string;
  schedule: string;
  enabled: boolean;
  lastTriggered?: string;
  status: 'active' | 'inactive' | 'error';
  createdAt: string;
}

const RecoveryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('recovery-events');
  const [isRestoreModalVisible, setIsRestoreModalVisible] = useState(false);
  const [isPolicyModalVisible, setIsPolicyModalVisible] = useState(false);
  const [restoreForm] = Form.useForm();
  const [policyForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: backups } = useQuery({
    queryKey: ['backups'],
    queryFn: getBackups,
  });

  const { data: clusters } = useQuery({
    queryKey: ['clusters'],
    queryFn: getClusters,
  });

  const { data: checkpointRestoreEvents, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['checkpoint-restore-events'],
    queryFn: getCheckpointRestoreEvents,
    refetchInterval: 30000, // Refresh every 30 seconds to show real-time recovery events
  });

  // Mock data for recovery policies (replace with actual API call later)
  const [recoveryPolicies] = useState<RecoveryPolicy[]>([
    {
      id: '1',
      name: 'Cross-Cluster MySQL Migration',
      description: 'Automated migration of MySQL databases between clusters',
      sourceCluster: 'cluster-east',
      targetCluster: 'cluster-west',
      resourceType: 'StatefulSet',
      schedule: '0 2 * * 0', // Weekly on Sunday at 2 AM
      enabled: true,
      lastTriggered: '2024-01-15T02:00:00Z',
      status: 'active',
      createdAt: '2024-01-01T10:00:00Z',
    },
    {
      id: '2',
      name: 'Development to Staging Migration',
      description: 'Migrate development workloads to staging environment',
      sourceCluster: 'dev-cluster',
      targetCluster: 'staging-cluster',
      resourceType: 'Pod',
      schedule: '0 18 * * 5', // Weekly on Friday at 6 PM
      enabled: false,
      status: 'inactive',
      createdAt: '2024-01-10T14:30:00Z',
    },
    {
      id: '3',
      name: 'Disaster Recovery Policy',
      description: 'Emergency migration policy for disaster recovery scenarios',
      sourceCluster: 'primary-cluster',
      targetCluster: 'dr-cluster',
      resourceType: 'StatefulSet',
      schedule: 'manual', // Triggered manually or by alerts
      enabled: true,
      status: 'active',
      createdAt: '2024-01-05T09:15:00Z',
    },
  ]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: createRecovery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recoveries'] });
      setIsRestoreModalVisible(false);
      restoreForm.resetFields();
      message.success('Recovery operation created successfully');
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to create recovery operation');
    },
  });

  const handleCreatePolicy = () => {
    policyForm.resetFields();
    setIsPolicyModalVisible(true);
  };

  const handleRestoreSubmit = async () => {
    try {
      const values = await restoreForm.validateFields();
      
      const requestData: CreateRecoveryRequest = {
        name: values.name,
        backupId: values.backupId,
        targetCluster: values.targetCluster,
        recoveryType: values.recoveryType,
        targetName: values.targetName,
        targetNamespace: values.targetNamespace,
      };

      createMutation.mutate(requestData);
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const handlePolicySubmit = async () => {
    try {
      const values = await policyForm.validateFields();
      
      // TODO: Implement actual policy creation API
      console.log('Creating recovery policy:', values);
      message.success('Recovery policy created successfully (mock)');
      setIsPolicyModalVisible(false);
      policyForm.resetFields();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleTogglePolicy = (policyId: string, enabled: boolean) => {
    // TODO: Implement actual policy toggle API
    console.log('Toggling policy:', policyId, enabled);
    message.success(`Policy ${enabled ? 'enabled' : 'disabled'} successfully (mock)`);
  };

  const handleDeletePolicy = (policyId: string) => {
    // TODO: Implement actual policy deletion API
    console.log('Deleting policy:', policyId);
    message.success('Policy deleted successfully (mock)');
  };

  const handleRefreshEvents = () => {
    queryClient.invalidateQueries({ queryKey: ['checkpoint-restore-events'] });
    message.success('Refreshing CheckpointRestore events...');
  };

  const getPhaseTag = (phase: string) => {
    const phaseConfig = {
      pending: { color: 'blue', text: 'Pending' },
      running: { color: 'processing', text: 'Running' },
      succeeded: { color: 'success', text: 'Succeeded' },
      failed: { color: 'error', text: 'Failed' },
      cancelled: { color: 'default', text: 'Cancelled' },
      unknown: { color: 'default', text: 'Unknown' },
    };
    
    const config = phaseConfig[phase?.toLowerCase() as keyof typeof phaseConfig] || 
      { color: 'default', text: phase || 'Unknown' };
    
    return <Badge status={config.color as any} text={config.text} />;
  };

  

  // Table columns for recovery policies
  const policyColumns = [
    {
      title: 'Policy Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: RecoveryPolicy) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-gray-500 text-sm">{record.description}</div>
        </div>
      ),
    },
    {
      title: 'Migration Path',
      key: 'migration',
      render: (_: any, record: RecoveryPolicy) => (
        <div className="text-sm">
          <span className="font-medium">{record.sourceCluster}</span>
          <span className="mx-2">→</span>
          <span className="font-medium">{record.targetCluster}</span>
          <div className="text-gray-500 text-xs">{record.resourceType}</div>
        </div>
      ),
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule',
      key: 'schedule',
      render: (schedule: string) => (
        <Tag color={schedule === 'manual' ? 'orange' : 'blue'}>
          {schedule === 'manual' ? 'Manual' : 'Automated'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: RecoveryPolicy) => (
        <div className="flex items-center gap-2">
          <Badge 
            status={status === 'active' ? 'success' : status === 'error' ? 'error' : 'default'} 
            text={status.charAt(0).toUpperCase() + status.slice(1)} 
          />
          <Switch 
            size="small" 
            checked={record.enabled}
            onChange={(checked) => handleTogglePolicy(record.id, checked)}
          />
        </div>
      ),
    },
    {
      title: 'Last Triggered',
      dataIndex: 'lastTriggered',
      key: 'lastTriggered',
      render: (date: string) => 
        date ? new Date(date).toLocaleDateString() : 'Never',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: RecoveryPolicy) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => message.info('View policy details (mock)')}
          >
            View
          </Button>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => message.info('Edit policy (mock)')}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete Policy"
            description="Are you sure you want to delete this recovery policy?"
            onConfirm={() => handleDeletePolicy(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Table columns for CheckpointRestore events
  const checkpointRestoreEventsColumns = [
    {
      title: 'Event Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: CheckpointRestoreEvent) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-gray-500 text-sm">
            Target: {record.cluster} | Namespace: {record.namespace}
          </div>
        </div>
      ),
    },
    {
      title: 'Source Resource',
      key: 'sourceResource',
      render: (_: any, record: CheckpointRestoreEvent) => (
        <div>
          <div className="font-medium">{record.resourceType}</div>
          <div className="text-gray-500 text-sm">
            {record.sourceResource || record.resourceName}
          </div>
          <div className="text-xs text-gray-400">
            {record.sourceNamespace && `ns: ${record.sourceNamespace}`}
          </div>
        </div>
      ),
    },
    {
      title: 'Migration Path',
      key: 'migration',
      render: (_: any, record: CheckpointRestoreEvent) => (
        <div className="text-sm">
          {record.sourceCluster && record.targetCluster ? (
            <>
              {record.sourceCluster === 'unknown-source' ? (
                <Tooltip title="Source cluster information not available in CheckpointRestore CR. This may need to be configured in the backup reference or CR metadata.">
                  <span className="font-medium text-orange-500 cursor-help">
                    Unknown Source
                  </span>
                </Tooltip>
              ) : (
                <span className="font-medium text-blue-600">{record.sourceCluster}</span>
              )}
              <span className="mx-2">→</span>
              <span className="font-medium text-green-600">{record.targetCluster}</span>
            </>
          ) : (
            <span className="text-gray-400">Migration info not available</span>
          )}
        </div>
      ),
    },
    {
      title: 'Container Images',
      key: 'containerImages',
      render: (_: any, record: CheckpointRestoreEvent) => (
        <div className="max-w-xs">
          {record.containerImages && record.containerImages.length > 0 ? (
            <div>
              {record.containerImages.slice(0, 2).map((image, index) => (
                <Tooltip key={index} title={image} placement="topLeft">
                  <Tag color="blue">
                    {image}
                  </Tag>
                </Tooltip>
              ))}
              {record.containerImages.length > 2 && (
                <Tooltip 
                  title={
                    <div>
                      <div className="font-medium mb-1">All Container Images:</div>
                      {record.containerImages.map((image, index) => (
                        <div key={index} className="text-xs mb-1">{image}</div>
                      ))}
                    </div>
                  }
                  placement="topLeft"
                >
                  <Tag color="blue">
                    +{record.containerImages.length - 2} more images...
                  </Tag>
                </Tooltip>
              )}
            </div>
          ) : (
            <span className="text-gray-400 text-xs">No images info</span>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'phase',
      key: 'phase',
      render: (phase: string) => getPhaseTag(phase),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: CheckpointRestoreEvent) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => message.info(`View details for ${record.name} (feature coming soon)`)}
          >
            View
          </Button>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'recovery-events',
      label: (
        <span>
          Recovery Events
        </span>
      ),
      children: (
        <div>
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <div>
                <Title level={4} className="mb-2">Recovery Events</Title>
                <Text type="secondary">
                  View recovery events from CheckpointRestore Custom Resources across all member clusters
                </Text>
              </div>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={handleRefreshEvents}
                loading={isLoadingEvents}
              >
                Refresh Events
              </Button>
            </div>
          </div>

          <Card>
            <Table
              columns={checkpointRestoreEventsColumns}
              dataSource={checkpointRestoreEvents?.events || []}
              loading={isLoadingEvents}
              rowKey="id"
              pagination={{
                total: checkpointRestoreEvents?.total || 0,
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => 
                  `${range[0]}-${range[1]} of ${total} recovery events`,
              }}
            />
          </Card>
        </div>
      ),
    },
    {
      key: 'policy',
      label: (
        <span>
          Recovery Policy
        </span>
      ),
      children: (
        <div>
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <div>
                <Title level={4} className="mb-2">Recovery Policies</Title>
                <Text type="secondary">
                  Configure automated migration policies for disaster recovery and workload migration
                </Text>
              </div>
              <Button 
                type="primary" 
                icon={<PlusOutlined />} 
                onClick={handleCreatePolicy}
                className="bg-green-600 hover:bg-green-700"
              >
                Create Policy
              </Button>
            </div>
          </div>

          <Card>
            <Table
              columns={policyColumns}
              dataSource={recoveryPolicies}
              rowKey="id"
              pagination={{
                total: recoveryPolicies.length,
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => 
                  `${range[0]}-${range[1]} of ${total} recovery policies`,
              }}
            />
          </Card>
        </div>
      ),
    },
  ];

  // Calculate statistics
  const getRecoveryStats = () => {
    const events = checkpointRestoreEvents?.events || [];
    
    return {
      totalEvents: events.length,
      runningEvents: events.filter(e => e.phase === 'running').length,
      succeededEvents: events.filter(e => e.phase === 'succeeded').length,
      failedEvents: events.filter(e => e.phase === 'failed').length,
    };
  };

  const stats = getRecoveryStats();

  return (
    <div className="p-6">
      <div className="mb-6">
        <Title level={2} className="mb-2">Recovery Management</Title>
        <Text type="secondary">
          Manage restore operations and recovery policies for backup and disaster recovery scenarios
        </Text>
      </div>

      {/* Statistics Cards */}
      <Row gutter={16} className="mb-6">
        <Col span={6}>
          <Card>
            <Statistic
              title="CheckpointRestore Events"
              value={stats.totalEvents}
              suffix={
                <div className="text-sm text-gray-500">
                  {stats.runningEvents > 0 && (
                    <span className="text-blue-600">{stats.runningEvents} running</span>
                  )}
                </div>
              }
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Successful Events"
              value={stats.succeededEvents}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        className="mt-4"
      />

      {/* Restore Modal */}
      <Modal
        title="Create Restore Operation"
        open={isRestoreModalVisible}
        onOk={handleRestoreSubmit}
        onCancel={() => setIsRestoreModalVisible(false)}
        width={600}
        confirmLoading={createMutation.isPending}
        okText="Create Restore"
        cancelText="Cancel"
      >
        <Form
          form={restoreForm}
          layout="vertical"
          initialValues={{
            recoveryType: 'restore'
          }}
        >
          <Form.Item
            name="name"
            label="Restore Name"
            rules={[
              { required: true, message: 'Please enter restore name' },
              { max: 100, message: 'Restore name must be less than 100 characters' }
            ]}
          >
            <Input placeholder="e.g., mysql-restore-prod" />
          </Form.Item>

          <Form.Item
            name="backupId"
            label="Source Backup"
            rules={[{ required: true, message: 'Please select a backup' }]}
          >
            <Select placeholder="Select backup to restore from">
              {backups?.backups?.map((backup: any) => (
                <Option key={backup.id} value={backup.id}>
                  <div>
                    <div className="font-medium">{backup.name}</div>
                    <div className="text-gray-500 text-sm">
                      {backup.cluster} / {backup.resourceType}: {backup.resourceName}
                    </div>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="targetCluster"
              label="Target Cluster"
              rules={[{ required: true, message: 'Please select target cluster' }]}
            >
              <Select placeholder="Select cluster">
                {clusters?.clusters?.map((cluster: any) => (
                  <Option key={cluster.name} value={cluster.name}>
                    {cluster.name} ({cluster.type})
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="recoveryType"
              label="Recovery Type"
              rules={[{ required: true, message: 'Please select recovery type' }]}
            >
              <Select placeholder="Select type">
                <Option value="restore">
                  <div>
                    <div className="font-medium">Restore</div>
                    <div className="text-gray-500 text-sm">Restore to original location</div>
                  </div>
                </Option>
                <Option value="migrate">
                  <div>
                    <div className="font-medium">Migrate</div>
                    <div className="text-gray-500 text-sm">Migrate to different cluster/location</div>
                  </div>
                </Option>
              </Select>
            </Form.Item>
          </div>

          <div className="border-t pt-4 mt-4">
            <h4 className="text-base font-medium mb-3">Optional: Custom Target Location</h4>
            <div className="grid grid-cols-2 gap-4">
              <Form.Item
                name="targetName"
                label="Target Resource Name"
                help="Leave empty to use original name"
              >
                <Input placeholder="e.g., mysql-restored" />
              </Form.Item>

              <Form.Item
                name="targetNamespace"
                label="Target Namespace"
                help="Leave empty to use original namespace"
              >
                <Input placeholder="e.g., production" />
              </Form.Item>
            </div>
          </div>
        </Form>
      </Modal>

      {/* Policy Modal */}
      <Modal
        title="Create Recovery Policy"
        open={isPolicyModalVisible}
        onOk={handlePolicySubmit}
        onCancel={() => setIsPolicyModalVisible(false)}
        width={700}
        okText="Create Policy"
        cancelText="Cancel"
      >
        <Form
          form={policyForm}
          layout="vertical"
          initialValues={{
            resourceType: 'StatefulSet',
            schedule: 'manual',
            enabled: true,
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="name"
              label="Policy Name"
              rules={[
                { required: true, message: 'Please enter policy name' },
                { max: 100, message: 'Policy name must be less than 100 characters' }
              ]}
            >
              <Input placeholder="e.g., DR Policy - MySQL" />
            </Form.Item>

            <Form.Item
              name="resourceType"
              label="Resource Type"
              rules={[{ required: true, message: 'Please select resource type' }]}
            >
              <Select placeholder="Select resource type">
                <Option value="Pod">Pod</Option>
                <Option value="StatefulSet">StatefulSet</Option>
                <Option value="Deployment">Deployment</Option>
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ max: 500, message: 'Description must be less than 500 characters' }]}
          >
            <Input.TextArea 
              placeholder="Describe the purpose and scope of this recovery policy"
              rows={3}
            />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="sourceCluster"
              label="Source Cluster"
              rules={[{ required: true, message: 'Please select source cluster' }]}
            >
              <Select placeholder="Select source cluster">
                {clusters?.clusters?.map((cluster: any) => (
                  <Option key={cluster.name} value={cluster.name}>
                    {cluster.name} ({cluster.type})
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="targetCluster"
              label="Target Cluster"
              rules={[{ required: true, message: 'Please select target cluster' }]}
            >
              <Select placeholder="Select target cluster">
                {clusters?.clusters?.map((cluster: any) => (
                  <Option key={cluster.name} value={cluster.name}>
                    {cluster.name} ({cluster.type})
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="schedule"
              label="Trigger Schedule"
              rules={[{ required: true, message: 'Please select schedule type' }]}
            >
              <Select placeholder="Select schedule">
                <Option value="manual">
                  <div>
                    <div className="font-medium">Manual Trigger</div>
                    <div className="text-gray-500 text-sm">Execute manually or via alerts</div>
                  </div>
                </Option>
                <Option value="0 2 * * 0">
                  <div>
                    <div className="font-medium">Weekly</div>
                    <div className="text-gray-500 text-sm">Every Sunday at 2:00 AM</div>
                  </div>
                </Option>
                <Option value="0 2 1 * *">
                  <div>
                    <div className="font-medium">Monthly</div>
                    <div className="text-gray-500 text-sm">1st of every month at 2:00 AM</div>
                  </div>
                </Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="enabled"
              label={
                <span>
                  Policy Status{' '}
                  <Tooltip title="Enable or disable this policy">
                    <InfoCircleOutlined />
                  </Tooltip>
                </span>
              }
              valuePropName="checked"
            >
              <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default RecoveryPage;