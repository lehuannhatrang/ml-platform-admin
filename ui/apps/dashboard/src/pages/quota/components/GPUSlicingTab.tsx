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

import { useState } from 'react';
import {
  Button,
  Card,
  Row,
  Col,
  Typography,
  Modal,
  Form,
  InputNumber,
  Tooltip,
  Statistic,
  message,
} from 'antd';
import { EditOutlined, SettingOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SetDashboardConfig, GPUConfig } from '@/services/dashboard-config';
import { getMaxSlices, getDefaultSlices } from '../utils';

const { Title, Text } = Typography;

interface GPUSlicingTabProps {
  gpuConfig: GPUConfig;
  onSave: (config: GPUConfig) => void;
}

const GPUSlicingTab = ({ gpuConfig, onSave }: GPUSlicingTabProps) => {
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (newConfig: GPUConfig) => {
      await SetDashboardConfig({ gpu_config: newConfig });
      return newConfig;
    },
    onSuccess: (newConfig) => {
      message.success('GPU slicing configuration saved successfully');
      setIsModalVisible(false);
      onSave(newConfig);
      queryClient.invalidateQueries({ queryKey: ['dashboardConfig'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to save GPU slicing configuration');
    },
  });

  const handleSave = () => {
    form.validateFields().then((values) => {
      saveMutation.mutate({
        total_vram_gib: values.totalVramGib,
        slice_size_gib: values.sliceSizeGib,
        default_slices: values.defaultSlices,
      });
    });
  };

  const handleEdit = () => {
    form.setFieldsValue({
      totalVramGib: gpuConfig.total_vram_gib,
      sliceSizeGib: gpuConfig.slice_size_gib,
      defaultSlices: gpuConfig.default_slices || 1,
    });
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  const maxSlices = getMaxSlices(gpuConfig);
  const defaultSlices = getDefaultSlices(gpuConfig);

  return (
    <>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <SettingOutlined style={{ marginRight: 8 }} />
              GPU Slicing Configuration
            </Title>
            <Text type="secondary">
              Configure how GPU VRAM is divided into slices for quota allocation
            </Text>
          </div>
          <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>
            Edit Configuration
          </Button>
        </Row>

        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic 
                title="Total GPU VRAM" 
                value={gpuConfig.total_vram_gib} 
                suffix="GB"
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic 
                title="Slice Size" 
                value={gpuConfig.slice_size_gib} 
                suffix="GB"
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic 
                title="Max Slices per GPU" 
                value={maxSlices} 
                suffix="slices"
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic 
                title="Default Quota" 
                value={defaultSlices} 
                suffix={`slice(s) = ${(defaultSlices * gpuConfig.slice_size_gib).toFixed(0)} GB`}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* Edit Configuration Modal */}
      <Modal
        title="Edit GPU Slicing Configuration"
        open={isModalVisible}
        onOk={handleSave}
        onCancel={handleCancel}
        confirmLoading={saveMutation.isPending}
        okText="Save"
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            totalVramGib: gpuConfig.total_vram_gib,
            sliceSizeGib: gpuConfig.slice_size_gib,
            defaultSlices: gpuConfig.default_slices || 1,
          }}
        >
          <Form.Item
            label={
              <span>
                Total GPU VRAM (GB){' '}
                <Tooltip title="Total video memory per GPU in gigabytes">
                  <InfoCircleOutlined />
                </Tooltip>
              </span>
            }
            name="totalVramGib"
            rules={[
              { required: true, message: 'Please enter total GPU VRAM' },
              { type: 'number', min: 1, message: 'Must be at least 1 GB' },
            ]}
          >
            <InputNumber
              min={1}
              max={1024}
              step={1}
              style={{ width: '100%' }}
              addonAfter="GB"
            />
          </Form.Item>

          <Form.Item
            label={
              <span>
                Slice Size (GB){' '}
                <Tooltip title="Size of each GPU slice in gigabytes. Users allocate quotas in whole slices.">
                  <InfoCircleOutlined />
                </Tooltip>
              </span>
            }
            name="sliceSizeGib"
            rules={[
              { required: true, message: 'Please enter slice size' },
              { type: 'number', min: 1, message: 'Must be at least 1 GB' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const totalVram = getFieldValue('totalVramGib');
                  if (value && totalVram && value > totalVram) {
                    return Promise.reject(new Error('Slice size cannot exceed total VRAM'));
                  }
                  if (value && totalVram && totalVram % value !== 0) {
                    return Promise.reject(new Error('Total VRAM must be divisible by slice size'));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <InputNumber
              min={1}
              max={form.getFieldValue('totalVramGib') || 24}
              step={1}
              style={{ width: '100%' }}
              addonAfter="GB"
            />
          </Form.Item>

          <Form.Item
            label={
              <span>
                Default Slices for New Users{' '}
                <Tooltip title="Number of GPU slices automatically assigned to new users when using 'Scan All'">
                  <InfoCircleOutlined />
                </Tooltip>
              </span>
            }
            name="defaultSlices"
            rules={[
              { required: true, message: 'Please enter default slices' },
              { type: 'number', min: 1, message: 'Must be at least 1 slice' },
            ]}
          >
            <InputNumber
              min={1}
              max={form.getFieldValue('totalVramGib') / form.getFieldValue('sliceSizeGib') || 6}
              step={1}
              style={{ width: '100%' }}
              addonAfter="slices"
            />
          </Form.Item>

          <Form.Item shouldUpdate>
            {() => {
              const totalVram = form.getFieldValue('totalVramGib') || 24;
              const sliceSize = form.getFieldValue('sliceSizeGib') || 4;
              const defSlices = form.getFieldValue('defaultSlices') || 1;
              const previewMaxSlices = Math.floor(totalVram / sliceSize);
              const previewFraction = (1 / previewMaxSlices * 100).toFixed(1);
              
              return (
                <Card size="small">
                  <Text strong>Preview: </Text>
                  <Text>
                    {previewMaxSlices} slices per GPU, each slice = {previewFraction}% of GPU
                  </Text>
                  <br />
                  <Text type="secondary">
                    New users will get {defSlices} slice(s) = {(defSlices * sliceSize).toFixed(0)} GB by default
                  </Text>
                </Card>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default GPUSlicingTab;

