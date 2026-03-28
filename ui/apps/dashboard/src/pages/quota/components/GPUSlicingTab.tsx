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
  theme,
  message,
} from 'antd';
import { EditOutlined, SettingOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SetDashboardConfig, GPUConfig } from '@/services/dashboard-config';
import { getNumGPUs, getSlicesPerGPU, getMaxSlices, getDefaultSlices } from '../utils';

const { Title, Text } = Typography;

// Accent colours are the same in both themes
const COLOR_DEFAULT = '#fa8c16';  // orange – default-quota slices
const COLOR_FREE    = '#13c2c2';  // teal   – free slices

// ─── GPUChip ─────────────────────────────────────────────────────────────────
interface GPUChipProps {
  index: number;
  vramGib: number;
  sliceSize: number;
  slicesPerGPU: number;
  defaultSlices: number;
  compact?: boolean;
}

const GPUChip = ({ index, vramGib, sliceSize, slicesPerGPU, defaultSlices, compact = false }: GPUChipProps) => {
  const { token } = theme.useToken();
  const height = compact ? 36 : 52;

  // chip icon centre-square colour matches the card background
  const chipCentre = token.colorBgElevated;

  return (
    <div style={{
      background: token.colorBgElevated,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 10,
      padding: compact ? '8px 10px' : '12px 14px',
      width: compact ? 180 : 220,
      flex: '0 0 auto',
      boxShadow: token.boxShadowSecondary,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 6 : 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* mini chip icon */}
          <svg width={compact ? 14 : 18} height={compact ? 14 : 18} viewBox="0 0 18 18" fill="none">
            <rect x="4" y="4" width="10" height="10" rx="2" fill={token.colorPrimary} opacity="0.9"/>
            <rect x="6" y="6" width="6" height="6" rx="1" fill={chipCentre}/>
            {[6, 9, 12].map(y => (
              <g key={y}>
                <line x1="0" y1={y} x2="4" y2={y} stroke={token.colorPrimary} strokeWidth="1.2"/>
                <line x1="14" y1={y} x2="18" y2={y} stroke={token.colorPrimary} strokeWidth="1.2"/>
              </g>
            ))}
            {[6, 9, 12].map(x => (
              <g key={x}>
                <line x1={x} y1="0" x2={x} y2="4" stroke={token.colorPrimary} strokeWidth="1.2"/>
                <line x1={x} y1="14" x2={x} y2="18" stroke={token.colorPrimary} strokeWidth="1.2"/>
              </g>
            ))}
          </svg>
          <Text style={{ fontWeight: 600, fontSize: compact ? 11 : 12 }}>
            GPU {index}
          </Text>
        </div>
        <Text type="secondary" style={{ fontSize: compact ? 10 : 11 }}>{vramGib} GB</Text>
      </div>

      {/* Slice bar */}
      <div style={{
        display: 'flex',
        background: token.colorFillAlter,
        borderRadius: 5,
        overflow: 'hidden',
        height,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}>
        {Array.from({ length: slicesPerGPU }).map((_, i) => {
          const isDefault = i < defaultSlices;
          const color = isDefault ? COLOR_DEFAULT : COLOR_FREE;
          const label = `${sliceSize} GB`;
          return (
            <Tooltip
              key={i}
              title={
                <span>
                  Slice {i + 1} — {label}
                  <br />
                  {isDefault ? '🟠 Default quota slice' : ''}
                </span>
              }
            >
              <div
                style={{
                  flex: 1,
                  background: color,
                  opacity: 0.85,
                  borderRight: i < slicesPerGPU - 1 ? `1px solid ${token.colorBgLayout}` : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.85')}
              >
                {!compact && (
                  <Text style={{
                    color: '#0d1117',
                    fontSize: 10,
                    fontWeight: 700,
                    userSelect: 'none',
                    textAlign: 'center',
                    lineHeight: 1,
                  }}>
                    {i+1}
                  </Text>
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

// ─── MiniGPUPreview ───────────────────────────────────────────────────────────
interface MiniGPUPreviewProps {
  numGPUs: number;
  vramGib: number;
  sliceSize: number;
  slicesPerGPU: number;
  defaultSlices: number;
}

const MiniGPUPreview = ({ numGPUs, vramGib, sliceSize, slicesPerGPU, defaultSlices }: MiniGPUPreviewProps) => {
  const { token } = theme.useToken();
  const show = Math.min(numGPUs, 4);

  return (
    <div style={{
      background: token.colorBgLayout,
      borderRadius: 8,
      padding: '12px 14px',
      border: `1px solid ${token.colorBorderSecondary}`,
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {Array.from({ length: show }).map((_, i) => (
          <GPUChip
            key={i}
            index={i}
            vramGib={vramGib}
            sliceSize={sliceSize}
            slicesPerGPU={slicesPerGPU}
            defaultSlices={defaultSlices}
            compact
          />
        ))}
        {numGPUs > show && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 60, fontSize: 13, fontWeight: 600, color: token.colorTextSecondary,
          }}>
            +{numGPUs - show} more
          </div>
        )}
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {numGPUs} GPU(s) · {numGPUs * slicesPerGPU} total slices · {numGPUs * vramGib} GB total ·{' '}
        Default: {defaultSlices} slice(s) = {defaultSlices * sliceSize} GB
      </Text>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
interface GPUSlicingTabProps {
  gpuConfig: GPUConfig;
  onSave: (config: GPUConfig) => void;
}

const GPUSlicingTab = ({ gpuConfig, onSave }: GPUSlicingTabProps) => {
  const { token } = theme.useToken();
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
        num_gpus: values.numGPUs,
        total_vram_gib: values.totalVramGib,
        slice_size_gib: values.sliceSizeGib,
        default_slices: values.defaultSlices,
      });
    });
  };

  const handleEdit = () => {
    form.setFieldsValue({
      numGPUs: gpuConfig.num_gpus || 1,
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

  const numGPUs       = getNumGPUs(gpuConfig);
  const slicesPerGPU  = getSlicesPerGPU(gpuConfig);
  const maxSlices     = getMaxSlices(gpuConfig);
  const defaultSlices = getDefaultSlices(gpuConfig);

  // Show up to 8 GPU chips individually; collapse the rest
  const visibleGPUs = Math.min(numGPUs, 8);

  return (
    <>
      <Card>
        {/* ── Header ── */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
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

        {/* ── Summary stat tiles ── */}
        <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
          {[
            { value: numGPUs,                                    unit: 'GPUs',         accent: token.colorPrimary },
            { value: slicesPerGPU,                               unit: 'Slices / GPU', accent: '#722ed1' },
            { value: maxSlices,                                  unit: 'Total Slices', accent: '#13c2c2' },
            { value: `${numGPUs * gpuConfig.total_vram_gib} GB`, unit: 'Total VRAM',   accent: '#fa8c16' },
          ].map(({ value, unit, accent }) => (
            <Col key={unit} xs={12} sm={6}>
              <div style={{
                background: token.colorBgLayout,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 8,
                padding: '10px 14px',
                borderLeft: `3px solid ${accent}`,
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1.2 }}>
                  {value}
                </div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {unit}
                </div>
              </div>
            </Col>
          ))}
        </Row>

        {/* ── GPU diagram ── */}
        <div style={{
          background: token.colorBgLayout,
          borderRadius: 12,
          padding: '20px 20px 16px',
          border: `1px solid ${token.colorBorderSecondary}`,
        }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {Array.from({ length: visibleGPUs }).map((_, i) => (
              <GPUChip
                key={i}
                index={i}
                vramGib={gpuConfig.total_vram_gib}
                sliceSize={gpuConfig.slice_size_gib}
                slicesPerGPU={slicesPerGPU}
                defaultSlices={defaultSlices}
              />
            ))}
            {numGPUs > visibleGPUs && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 80, fontSize: 14, fontWeight: 600, color: token.colorTextSecondary,
              }}>
                +{numGPUs - visibleGPUs} more
              </div>
            )}
          </div>

          {/* ── Colour legend ── */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_DEFAULT, flexShrink: 0 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Default quota — {defaultSlices} slice{defaultSlices > 1 ? 's' : ''} = {defaultSlices * gpuConfig.slice_size_gib} GB
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_FREE, flexShrink: 0 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Available — {slicesPerGPU - defaultSlices} free slice{slicesPerGPU - defaultSlices !== 1 ? 's' : ''} per GPU
              </Text>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Edit Configuration Modal ── */}
      <Modal
        title="Edit GPU Slicing Configuration"
        open={isModalVisible}
        onOk={handleSave}
        onCancel={handleCancel}
        confirmLoading={saveMutation.isPending}
        okText="Save"
        width={540}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            numGPUs: gpuConfig.num_gpus || 1,
            totalVramGib: gpuConfig.total_vram_gib,
            sliceSizeGib: gpuConfig.slice_size_gib,
            defaultSlices: gpuConfig.default_slices || 1,
          }}
        >
          <Form.Item
            label={
              <span>
                Number of GPUs{' '}
                <Tooltip title="Total number of GPUs available in the cluster">
                  <InfoCircleOutlined />
                </Tooltip>
              </span>
            }
            name="numGPUs"
            rules={[
              { required: true, message: 'Please enter number of GPUs' },
              { type: 'number', min: 1, message: 'Must be at least 1 GPU' },
            ]}
          >
            <InputNumber min={1} max={256} step={1} style={{ width: '100%' }} addonAfter="GPU(s)" />
          </Form.Item>

          <Form.Item
            label={
              <span>
                VRAM per GPU (GB){' '}
                <Tooltip title="Video memory of each GPU in gigabytes">
                  <InfoCircleOutlined />
                </Tooltip>
              </span>
            }
            name="totalVramGib"
            rules={[
              { required: true, message: 'Please enter VRAM per GPU' },
              { type: 'number', min: 1, message: 'Must be at least 1 GB' },
            ]}
          >
            <InputNumber min={1} max={1024} step={1} style={{ width: '100%' }} addonAfter="GB" />
          </Form.Item>

          <Form.Item
            label={
              <span>
                Slice Size (GB){' '}
                <Tooltip title="Size of each GPU slice in gigabytes. VRAM per GPU must be divisible by this.">
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
                  if (value && totalVram && value > totalVram)
                    return Promise.reject(new Error('Slice size cannot exceed VRAM per GPU'));
                  if (value && totalVram && totalVram % value !== 0)
                    return Promise.reject(new Error('VRAM per GPU must be divisible by slice size'));
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <InputNumber min={1} max={form.getFieldValue('totalVramGib') || 24} step={1} style={{ width: '100%' }} addonAfter="GB" />
          </Form.Item>

          <Form.Item
            label={
              <span>
                Default Slices for New Users{' '}
                <Tooltip title="Number of GPU slices automatically assigned to new users">
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
            <InputNumber min={1} step={1} style={{ width: '100%' }} addonAfter="slices" />
          </Form.Item>

          {/* Live preview diagram */}
          <Form.Item shouldUpdate label="Preview">
            {() => {
              const n   = form.getFieldValue('numGPUs')       || 1;
              const v   = form.getFieldValue('totalVramGib')  || 24;
              const s   = form.getFieldValue('sliceSizeGib')  || 4;
              const d   = form.getFieldValue('defaultSlices') || 1;
              const spg = s > 0 ? Math.floor(v / s) : 0;
              return <MiniGPUPreview numGPUs={n} vramGib={v} sliceSize={s} slicesPerGPU={spg} defaultSlices={d} />;
            }}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default GPUSlicingTab;
