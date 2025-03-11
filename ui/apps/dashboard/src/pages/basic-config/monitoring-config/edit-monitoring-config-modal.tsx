import React, { useEffect } from 'react';
import { Modal, Form, Input, Select } from 'antd';
import i18nInstance from '@/utils/i18n';
import { IResponse } from '@/services/base';
import { AddMonitoringConfig } from '@/services/monitoring-config';
import { MonitoringType } from '@/services/monitoring-config';

interface MonitoringConfigModalProps {
  mode: 'create' | 'edit';
  open: boolean;
  name: string;
  endpoint: string;
  token: string;
  type: MonitoringType;
  onCancel: () => Promise<void> | void;
  onOk: (ret: IResponse<any>) => Promise<void>;
}

const monitoringTypeOptions = [
  { label: 'Grafana', value: 'grafana' },
];

const MonitoringConfigModal: React.FC<MonitoringConfigModalProps> = ({
  mode,
  open,
  name,
  endpoint,
  token,
  type,
  onCancel,
  onOk,
}) => {
  const [form] = Form.useForm<{
    name: string;
    type: MonitoringType;
    endpoint: string;
    token: string;
  }>();

  useEffect(() => {
    form.setFieldsValue({
      name,
      type,
      endpoint,
      token,
    });
  }, [name, type, endpoint, token]);

  return (
    <Modal
      title={
        mode === 'create'
          ? 'Add new monitoring source'
          : 'Edit monitoring source'
      }
      open={open}
      width={1000}
      okText={i18nInstance.t('38cf16f2204ffab8a6e0187070558721', '确定')}
      cancelText={i18nInstance.t('625fb26b4b3340f7872b411f401e754c', '取消')}
      destroyOnClose={true}
      onOk={async () => {
        const submitData = await form.validateFields();
        if(mode === "create"){
          const ret = await AddMonitoringConfig(submitData);
          await onOk(ret);
        } else {
          //TODO
        }
      }}
      onCancel={async () => {
        await onCancel();
      }}
    >

      <Form
        form={form}
        validateMessages={{
          required: i18nInstance.t(
            'e0a23c19b8a0044c5defd167b441d643',
            "'${name}' 是必选字段",
          ),
        }}
      >

        <Form.Item
          name='name'
          label='Name'
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name='endpoint'
          label='Endpoint'
          rules={[{ required: true }]}
        >
          <Input disabled={mode === 'edit'}  />
        </Form.Item>

        <Form.Item
          name='token'
          label='Token'
          rules={[{ required: true }]}
        >
          <Input.Password />
        </Form.Item>

        <Form.Item
          name='type'
          label='Type'
          rules={[{ required: true }]}
        >
          <Select
            options={monitoringTypeOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default MonitoringConfigModal;
