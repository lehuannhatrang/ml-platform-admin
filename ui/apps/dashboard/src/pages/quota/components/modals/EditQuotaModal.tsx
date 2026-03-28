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

import { useEffect } from 'react';
import { Modal, Form, InputNumber, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { GPUConfig } from '@/services/dashboard-config';
import { QuotaAssignment } from '@/services/quota';
import { getMaxSlices, getSlicesPerGPU, getNumGPUs, fractionToSlices } from '../../utils';

interface EditQuotaModalProps {
  open: boolean;
  loading: boolean;
  gpuConfig: GPUConfig;
  assignment: QuotaAssignment | null;
  onOk: (values: { gpuSlices: number }) => void;
  onCancel: () => void;
}

const EditQuotaModal = ({
  open,
  loading,
  gpuConfig,
  assignment,
  onOk,
  onCancel,
}: EditQuotaModalProps) => {
  const [form] = Form.useForm();
  const maxSlices = getMaxSlices(gpuConfig);       // total across all GPUs
  const slicesPerGPU = getSlicesPerGPU(gpuConfig);
  const numGPUs = getNumGPUs(gpuConfig);

  useEffect(() => {
    if (open && assignment) {
      const currentSlices = fractionToSlices(assignment.resources?.gpu?.quota ?? 0, gpuConfig);
      form.setFieldsValue({
        gpuSlices: Math.round(currentSlices * 10) / 10,
      });
    }
  }, [open, assignment, gpuConfig, form]);

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
      title={`Edit GPU Quota for "${assignment?.profile}"`}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={500}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label={
            <span>
              GPU Slices{' '}
              <Tooltip title={`Each slice = ${gpuConfig.slice_size_gib} GB VRAM. Max ${maxSlices} slices (${numGPUs} GPU(s) × ${slicesPerGPU} slices/GPU).`}>
                <InfoCircleOutlined />
              </Tooltip>
            </span>
          }
          name="gpuSlices"
          rules={[{ required: true, message: 'Please enter number of GPU slices' }]}
          extra={
            <Form.Item noStyle shouldUpdate>
              {() => {
                const slices = form.getFieldValue('gpuSlices') || 0;
                return (
                  <span>
                    {slices} slice(s) = {(slices * gpuConfig.slice_size_gib).toFixed(1)} GB
                    {numGPUs > 1 && slices > slicesPerGPU && (
                      <span style={{ color: '#1890ff', marginLeft: 6 }}>
                        (spans {Math.ceil(slices / slicesPerGPU)} GPU(s))
                      </span>
                    )}
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
            placeholder="1" 
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EditQuotaModal;

