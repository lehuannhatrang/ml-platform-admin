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

import { Modal, Alert, Typography } from 'antd';
import { GPUConfig } from '@/services/dashboard-config';
import { getDefaultSlices, getNumGPUs, getMaxSlices } from '../../utils';

const { Text } = Typography;

interface ScanAllModalProps {
  open: boolean;
  loading: boolean;
  gpuConfig: GPUConfig;
  missingCount: number;
  onOk: () => void;
  onCancel: () => void;
}

const ScanAllModal = ({
  open,
  loading,
  gpuConfig,
  missingCount,
  onOk,
  onCancel,
}: ScanAllModalProps) => {
  const defaultSlices = getDefaultSlices(gpuConfig);
  const defaultGB = (defaultSlices * gpuConfig.slice_size_gib).toFixed(0);
  const numGPUs = getNumGPUs(gpuConfig);
  const totalSlices = getMaxSlices(gpuConfig);

  return (
    <Modal
      title="Scan and Create Quotas"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Scan & Create"
      cancelText="Cancel"
    >
      <div style={{ marginBottom: 16 }}>
        <Text>
          This will scan all user profiles and create default quotas for those without one.
        </Text>
      </div>

      {missingCount > 0 && (
        <Alert
          type="warning"
          message={`Found ${missingCount} profile(s) without quota`}
          style={{ marginBottom: 16 }}
        />
      )}

      <Alert
        type="info"
        message={`Default quota: ${defaultSlices} slice(s) = ${defaultGB} GB`}
        description={`Cluster total: ${numGPUs} GPU(s), ${totalSlices} slices available. Configurable in the GPU Slicing tab.`}
      />
    </Modal>
  );
};

export default ScanAllModal;

