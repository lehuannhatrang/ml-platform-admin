import { useEffect, useState } from 'react';
import { Modal, Form, Select, Spin, message, Input, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { GetMonitoringConfig, GetMonitoringDashboards, SaveMonitoringDashboard, MonitoringType, MonitoringDashboard } from '@/services/monitoring-config';
import { ExportOutlined } from '@ant-design/icons';

interface MonitoringConfig {
  name: string;
  type: MonitoringType;
  endpoint: string;
  token: string;
}

interface NewDashboardModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const NewDashboardModal = ({ open, onCancel, onSuccess }: NewDashboardModalProps) => {
  const [form] = Form.useForm<{
    name: string;
    monitoring: string;
    dashboard: string;
  }>();
  const [selectedMonitoring, setSelectedMonitoring] = useState<MonitoringConfig | null>(null);
  const [selectedDashboard, setSelectedDashboard] = useState<MonitoringDashboard | null>(null);

  // Fetch monitoring configurations
  const { data: monitoringData, isLoading: isLoadingMonitoring } = useQuery({
    queryKey: ['monitoring-config'],
    queryFn: async () => {
      const result = await GetMonitoringConfig();
      return result.data;
    },
  });

  // Fetch dashboards when monitoring is selected
  const { data: dashboardsData, isLoading: isLoadingDashboards } = useQuery({
    queryKey: ['monitoring-dashboards', selectedMonitoring],
    queryFn: async () => {
      if (!selectedMonitoring) {
        throw new Error('No monitoring selected');
      }
      const result = await GetMonitoringDashboards({ name: selectedMonitoring.name });
      return result.data;
    },
    enabled: !!selectedMonitoring,
  });

  // Reset form when modal is opened
  useEffect(() => {
    if (open) {
      form.resetFields();
      setSelectedMonitoring(null);
    }
  }, [open, form]);

  const handleMonitoringChange = (value: string) => {
    setSelectedMonitoring(monitoringData?.monitorings?.find((m: MonitoringConfig) => m.endpoint === value) || null);
    form.setFieldValue('dashboard', undefined);
  };

  const handleDashboardChange = (value: string) => {
    setSelectedDashboard(dashboardsData?.dashboards?.find((d: MonitoringDashboard) => d.uid === value) || null);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const monitoring = monitoringData?.monitorings?.find((m: MonitoringConfig) => m.endpoint === values.monitoring);
      const dashboard = dashboardsData?.dashboards?.find((d: MonitoringDashboard) => d.uid === values.dashboard);
      const name = values.name;

      if (!monitoring || !dashboard) {
        message.error('Invalid selection');
        return;
      }

      // Save dashboard selection to backend
      await SaveMonitoringDashboard({
        name: name,
        url: `${monitoring.endpoint}${dashboard.url}`,
      });

      message.success('Dashboard added successfully');
      onSuccess();
      onCancel();
    } catch (error) {
      if (error instanceof Error) {
        message.error(`Failed to save dashboard: ${error.message}`);
      }
      console.error('Failed to save dashboard:', error);
    }
  };

  const grafanaMonitorings = monitoringData?.monitorings?.filter((m: MonitoringConfig) => m.type === MonitoringType.GRAFANA) ?? [];
  const dashboards = dashboardsData?.dashboards ?? [];

  return (
    <Modal
      title="Add Dashboard"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={isLoadingMonitoring || isLoadingDashboards}
    >
      <Spin spinning={isLoadingMonitoring}>
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter a dashboard name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="monitoring"
            label="Monitoring Source"
            rules={[{ required: true, message: 'Please select a monitoring source' }]}
          >
            <Select
              placeholder="Select monitoring source"
              onChange={handleMonitoringChange}
              options={grafanaMonitorings.map((m: MonitoringConfig) => ({
                label: m.name,
                value: m.endpoint,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="dashboard"
            label="Dashboard"
            rules={[{ required: true, message: 'Please select a dashboard' }]}
          >
            <Select
              placeholder="Select dashboard"
              disabled={!selectedMonitoring || isLoadingDashboards}
              loading={isLoadingDashboards}
              showSearch
              optionFilterProp="label"
              options={dashboards.map((d: MonitoringDashboard) => ({
                label: d.title,
                value: d.uid,
                type: d.type,
                folderTitle: d.folderTitle,
              }))}
              optionRender={(option) => (
                <div>
                  <div>{option.data.label}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    Folder: {option.data?.folderTitle || 'Dashboards'}
                  </div>
                </div>
              )}
              onChange={handleDashboardChange}
            />
          </Form.Item>
          <Typography.Text className='text-gray-500 min-height-24'>
            {selectedMonitoring && selectedDashboard &&
              <a href={`${selectedMonitoring.endpoint}${selectedDashboard.url}`} target='_blank'>
                Click here to open Dashboard
                <ExportOutlined className='ml-2' />
              </a>
            }
          </Typography.Text>
        </Form>
      </Spin>
    </Modal>
  );
};

export default NewDashboardModal;