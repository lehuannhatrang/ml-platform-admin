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

import i18nInstance from '@/utils/i18n';
import { FC, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select } from 'antd';
import { CreateCAPICluster } from '@/services/cluster';
import { IResponse } from '@/services/base.ts';
import { GetCloudCredentials } from '@/services/cloudcredentials';
import { useQuery } from '@tanstack/react-query';
import CloudProviderSelector from '@/components/cloud-provider-selector';

export interface CreateCAPIClusterModalProps {
  open: boolean;
  onOk: (ret: IResponse<any>) => void;
  onCancel: () => void;
}

const formItemLayout = {
  labelCol: {
    xs: { span: 24 },
    sm: { span: 5 },
  },
  wrapperCol: {
    xs: { span: 24 },
    sm: { span: 19 },
  },
};

const CreateCAPIClusterModal: FC<CreateCAPIClusterModalProps> = (props) => {
  const { open, onOk, onCancel } = props;
  const [form] = Form.useForm<{
    clusterName: string;
    cloudProvider: string;
    credentialName: string;
    region: string;
    nodeCount: number;
    machineType: string;
    kubernetesVersion: string;
  }>();
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');

  // Load cloud credentials
  const { data: credentialsData } = useQuery({
    queryKey: ['GetCloudCredentials'],
    queryFn: async () => {
      const ret = await GetCloudCredentials();
      return ret.data;
    },
    enabled: open,
  });

  // Filter credentials by selected provider
  const filteredCredentials = credentialsData?.credentials.filter(
    (cred) => !selectedProvider || cred.provider === selectedProvider
  ) || [];

  return (
    <Modal
      open={open}
      title="Create New Cluster on Cloud Provider"
      width={900}
      okText={i18nInstance.t('38cf16f2204ffab8a6e0187070558721', '确定')}
      cancelText={i18nInstance.t('625fb26b4b3340f7872b411f401e754c', '取消')}
      destroyOnClose={true}
      confirmLoading={confirmLoading}
      onOk={async () => {
        try {
          setConfirmLoading(true);
          const submitData = await form.validateFields();
          const ret = await CreateCAPICluster({
            clusterName: submitData.clusterName,
            cloudProvider: submitData.cloudProvider,
            credentialName: submitData.credentialName,
            region: submitData.region,
            nodeCount: submitData.nodeCount,
            machineType: submitData.machineType,
            kubernetesVersion: submitData.kubernetesVersion,
          });
          onOk(ret);
        } catch (e) {
          console.log('Validation or submission error:', e);
        } finally {
          setConfirmLoading(false);
        }
      }}
      onCancel={() => {
        form.resetFields();
        setSelectedProvider('');
        onCancel();
      }}
    >
      <Form
        form={form}
        className="min-h-[500px]"
        validateMessages={{
          required: i18nInstance.t(
            'e0a23c19b8a0044c5defd167b441d643',
            "'${name}' 是必选字段"
          ),
        }}
        initialValues={{
          nodeCount: 3,
          kubernetesVersion: 'v1.34.1',
        }}
      >
        <Form.Item
          label="Cluster Name"
          name="clusterName"
          required
          rules={[
            { required: true },
            {
              pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
              message: 'Name must consist of lower case alphanumeric characters or "-"',
            },
          ]}
          {...formItemLayout}
        >
          <Input placeholder="Enter cluster name (e.g., prod-cluster-01)" />
        </Form.Item>

        <Form.Item
          label="Cloud Provider"
          name="cloudProvider"
          required
          rules={[{ required: true, message: 'Please select a cloud provider' }]}
          {...formItemLayout}
        >
          <CloudProviderSelector
            onChange={(value) => {
              setSelectedProvider(value);
              form.setFieldsValue({ credentialName: undefined });
            }}
          />
        </Form.Item>

        <Form.Item
          label="Credentials"
          name="credentialName"
          required
          rules={[{ required: true }]}
          {...formItemLayout}
          tooltip="Select cloud credentials. Only credentials matching the selected provider are shown."
        >
          <Select
            placeholder="Select cloud credentials"
            options={filteredCredentials.map((cred) => ({
              label: `${cred.name} (${cred.provider})`,
              value: cred.name,
            }))}
            loading={!credentialsData}
            disabled={!selectedProvider}
            notFoundContent={
              !selectedProvider
                ? 'Please select a cloud provider first'
                : 'No credentials found for this provider'
            }
          />
        </Form.Item>

        <Form.Item
          label="Region"
          name="region"
          required
          rules={[{ required: true }]}
          {...formItemLayout}
          tooltip="Cloud region where the cluster will be created"
        >
          <Input placeholder="e.g., us-east-1, us-central1, eastus" />
        </Form.Item>

        <Form.Item
          label="Kubernetes Version"
          name="kubernetesVersion"
          required
          rules={[{ required: true }]}
          {...formItemLayout}
        >
          <Input placeholder="e.g., v1.34.1, v1.28.0" />
        </Form.Item>

        <Form.Item
          label="Node Count"
          name="nodeCount"
          required
          rules={[{ required: true, type: 'number', min: 1, max: 100 }]}
          {...formItemLayout}
          tooltip="Number of worker nodes for the cluster"
        >
          <InputNumber min={1} max={100} style={{ width: '200px' }} />
        </Form.Item>

        <Form.Item
          label="Machine Type"
          name="machineType"
          required
          rules={[{ required: true }]}
          {...formItemLayout}
          tooltip="Instance/VM type for worker nodes"
        >
          <Input placeholder="e.g., t3.medium, n1-standard-2, Standard_D2s_v3" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateCAPIClusterModal;

