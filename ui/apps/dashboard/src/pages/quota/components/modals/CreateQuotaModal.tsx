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

import { Modal, Form, Select, InputNumber, Tooltip, Empty } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { GPUConfig } from '@/services/dashboard-config';
import { getMaxSlices, getDefaultSlices } from '../../utils';

interface ProfileOption {
  value: string;
  label: string;
  email: string;
}

interface CreateQuotaModalProps {
  open: boolean;
  loading: boolean;
  gpuConfig: GPUConfig;
  availableProfiles: ProfileOption[];
  onOk: (values: { profile: string; gpuSlices: number }) => void;
  onCancel: () => void;
}

const CreateQuotaModal = ({
  open,
  loading,
  gpuConfig,
  availableProfiles,
  onOk,
  onCancel,
}: CreateQuotaModalProps) => {
  const [form] = Form.useForm();
  const maxSlices = getMaxSlices(gpuConfig);
  const defaultSlices = getDefaultSlices(gpuConfig);

  const handleOk = () => {
    form.validateFields().then((values) => {
      onOk(values);
      form.resetFields();
    });
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title="Create GPU Quota for Profile"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ gpuSlices: defaultSlices }}
      >
        <Form.Item
          label="Profile"
          name="profile"
          rules={[{ required: true, message: 'Please select a profile' }]}
          extra="Select a user profile to assign GPU quota"
        >
          <Select
            showSearch
            placeholder="Select a profile"
            optionFilterProp="children"
            filterOption={(input, option) =>
              (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={availableProfiles}
            notFoundContent={
              availableProfiles.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="All profiles have quotas assigned"
                />
              ) : null
            }
          />
        </Form.Item>

        <Form.Item
          label={
            <span>
              GPU Slices{' '}
              <Tooltip title={`Number of GPU slices to allocate. Each slice = ${gpuConfig.slice_size_gib} GB VRAM`}>
                <InfoCircleOutlined />
              </Tooltip>
            </span>
          }
          name="gpuSlices"
          rules={[{ required: true, message: 'Please enter number of GPU slices' }]}
          extra={
            <Form.Item noStyle shouldUpdate>
              {() => {
                const slices = form.getFieldValue('gpuSlices') || defaultSlices;
                return (
                  <span>
                    {slices} slice(s) = {(slices * gpuConfig.slice_size_gib).toFixed(1)} GB
                  </span>
                );
              }}
            </Form.Item>
          }
        >
          <InputNumber 
            min={0} 
            max={maxSlices}
            step={1} 
            placeholder={String(defaultSlices)} 
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateQuotaModal;

