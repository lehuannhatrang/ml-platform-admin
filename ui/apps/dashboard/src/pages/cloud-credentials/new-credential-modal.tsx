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
import { FC, useEffect, useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import TextareaWithUpload from '@/components/textarea-with-upload';
import CloudProviderSelector from '@/components/cloud-provider-selector';
import {
  CloudCredential,
  CreateCloudCredential,
  UpdateCloudCredential,
  GetCloudCredentialContent,
} from '@/services/cloudcredentials';
import { IResponse } from '@/services/base.ts';

const { TextArea } = Input;

export interface NewCredentialModalProps {
  mode: 'create' | 'edit';
  open: boolean;
  onOk: (ret: IResponse<any>) => void;
  onCancel: () => void;
  credential?: CloudCredential;
}

const formItemLayout = {
  labelCol: {
    xs: { span: 24 },
    sm: { span: 4 },
  },
  wrapperCol: {
    xs: { span: 24 },
    sm: { span: 20 },
  },
};

const NewCredentialModal: FC<NewCredentialModalProps> = (props) => {
  const { mode, open, onOk, onCancel, credential } = props;
  const [form] = Form.useForm<{
    name: string;
    provider: string;
    credentials: string;
    description: string;
  }>();
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && credential && open) {
      setLoadingContent(true);
      // Load the credential content for editing
      GetCloudCredentialContent(credential.name)
        .then((resp) => {
          if (resp.code === 200) {
            // Decode base64 credentials
            const decodedCredentials = atob(resp.data.credentials);
            form.setFieldsValue({
              name: credential.name,
              provider: credential.provider,
              description: credential.description || '',
              credentials: decodedCredentials,
            });
          } else {
            message.error('Failed to load credential content');
          }
        })
        .catch((err) => {
          console.error('Failed to load credential:', err);
          message.error('Failed to load credential content');
        })
        .finally(() => {
          setLoadingContent(false);
        });
    } else if (mode === 'create' && open) {
      form.resetFields();
    }
  }, [mode, credential, open, form]);

  return (
    <Modal
      open={open}
      title={mode === 'create' ? 'Add Cloud Credential' : 'Edit Cloud Credential'}
      width={800}
      okText={i18nInstance.t('38cf16f2204ffab8a6e0187070558721', '确定')}
      cancelText={i18nInstance.t('625fb26b4b3340f7872b411f401e754c', '取消')}
      destroyOnClose={true}
      confirmLoading={confirmLoading || loadingContent}
      onOk={async () => {
        try {
          setConfirmLoading(true);
          const submitData = await form.validateFields();
          if (mode === 'edit' && credential) {
            const ret = await UpdateCloudCredential(credential.name, {
              credentials: submitData.credentials,
              description: submitData.description,
            });
            onOk(ret);
          } else if (mode === 'create') {
            const ret = await CreateCloudCredential({
              name: submitData.name,
              provider: submitData.provider,
              credentials: submitData.credentials,
              description: submitData.description,
            });
            onOk(ret);
          }
        } catch (e) {
          console.log('Validation or submission error:', e);
        } finally {
          setConfirmLoading(false);
        }
      }}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
    >
      <Form
        form={form}
        className={'min-h-[400px]'}
        validateMessages={{
          required: i18nInstance.t(
            'e0a23c19b8a0044c5defd167b441d643',
            "'${name}' 是必选字段"
          ),
        }}
      >
        <Form.Item
          label="Credential Name"
          name="name"
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
          <Input
            placeholder="Enter credential name (e.g., aws-prod-credentials)"
            disabled={mode !== 'create'}
          />
        </Form.Item>

        <Form.Item
          label="Cloud Provider"
          name="provider"
          required
          rules={[{ required: true, message: 'Please select a cloud provider' }]}
          {...formItemLayout}
        >
          <CloudProviderSelector disabled={mode !== 'create'} />
        </Form.Item>

        <Form.Item
          label="Description"
          name="description"
          {...formItemLayout}
        >
          <TextArea
            rows={2}
            placeholder="Optional description for this credential"
          />
        </Form.Item>

        <Form.Item
          label="Credentials"
          name="credentials"
          required
          rules={[{ required: true, message: 'Credentials are required' }]}
          {...formItemLayout}
          tooltip="You can paste credentials JSON/YAML or upload a file"
          className='mt-12'
        >
          <TextareaWithUpload
            height="300px"
            defaultLanguage="json"
            options={{
              minimap: {
                enabled: false,
              },
            }}
            checkContent={(data) => {
              if (data.err) return false;
              return true
            }}
            uploadButtonText="Paste credentials here or upload a file"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default NewCredentialModal;

