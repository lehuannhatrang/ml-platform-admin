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
import { FC, useEffect, useState, useMemo } from 'react';
import { Form, Modal, Select, Flex, App } from 'antd';
import { parse } from 'yaml';
import _ from 'lodash';
import { CreateMemberResource, PutMemberResource } from '@/services/unstructured';
import { IResponse } from '@/services/base.ts';
import { useCluster } from '@/hooks';
import TextareaWithUpload from '@/components/textarea-with-upload';

export interface PersistentVolumeEditorModalProps {
  mode: 'create' | 'edit';
  open: boolean;
  pvContent?: string;
  onOk: (ret: IResponse<any>) => Promise<void>;
  onCancel: () => Promise<void> | void;
  cluster: string;
}

// Default PV template for new PVs
const DEFAULT_PV_TEMPLATE = `apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-example
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: standard
  volumeMode: Filesystem
  hostPath:
    path: "/mnt/data"
`;

const PersistentVolumeEditorModal: FC<PersistentVolumeEditorModalProps> = (props) => {
  const { mode, open, pvContent = DEFAULT_PV_TEMPLATE, onOk, onCancel, cluster: clusterName } = props;
  const [content, setContent] = useState<string>(pvContent);
  const { message } = App.useApp();

  useEffect(() => {
    setContent(mode === 'create' ? DEFAULT_PV_TEMPLATE : pvContent);
  }, [pvContent, mode]);

  function handleEditorChange(value: string | undefined) {
    setContent(value || '');
  }

  const [form] = Form.useForm<{
    cluster: string;
  }>();

  useEffect(() => {
    form.setFieldsValue({
      cluster: clusterName,
    });
  }, [clusterName]);

  const { clusterOptions, isClusterDataLoading } = useCluster({ allowSelectAll: false });
  const clusterOptionsFormated = useMemo(() => {
    return clusterOptions.map((item) => {
      return {
        label: item.label,
        value: item.label,
      };
    });
  }, [clusterOptions]);

  const validateYaml = (yamlContent: string) => {
    try {
      const yamlObject = parse(yamlContent) as Record<string, any>;
      
      // Check required fields
      if (_.get(yamlObject, 'kind') !== 'PersistentVolume') {
        return { valid: false, error: 'Resource must be of kind PersistentVolume' };
      }
      
      if (!_.get(yamlObject, 'metadata.name')) {
        return { valid: false, error: 'metadata.name is required' };
      }
      
      if (!_.get(yamlObject, 'spec.capacity.storage')) {
        return { valid: false, error: 'spec.capacity.storage is required' };
      }
      
      if (!_.get(yamlObject, 'spec.accessModes') || !_.get(yamlObject, 'spec.accessModes').length) {
        return { valid: false, error: 'spec.accessModes is required' };
      }
      
      return { valid: true, yamlObject };
    } catch (e) {
      return { valid: false, error: 'Invalid YAML format' };
    }
  };

  return (
    <Modal
      title={
        mode === 'create'
          ? i18nInstance.t('create_persistent_volume', 'Create Persistent Volume')
          : i18nInstance.t('edit_persistent_volume', 'Edit Persistent Volume')
      }
      open={open}
      width={1000}
      okText={i18nInstance.t('confirm', 'Confirm')}
      cancelText={i18nInstance.t('cancel', 'Cancel')}
      destroyOnClose={true}
      onOk={async () => {
        try {
          const validation = validateYaml(content);
          if (!validation.valid) {
            message.error(validation.error);
            return;
          }
          
          const yamlObject = validation.yamlObject;
          const name = _.get(yamlObject, 'metadata.name', '');
          const submitData = await form.validateFields();
          
          if (mode === 'create') {
            const ret = await CreateMemberResource({
              kind: 'PersistentVolume',
              cluster: submitData.cluster,
              content: yamlObject as Record<string, any>,
            });
            await onOk(ret);
            setContent(DEFAULT_PV_TEMPLATE);
          } else {
            const ret = await PutMemberResource({
              kind: 'PersistentVolume',
              name,
              content: yamlObject as Record<string, any>,
              cluster: submitData.cluster,
            });
            await onOk(ret);
            setContent(DEFAULT_PV_TEMPLATE);
          }
        } catch (e) {
          console.error('Error creating/updating PersistentVolume:', e);
          message.error('Failed to save Persistent Volume');
        }
      }}
      onCancel={async () => {
        await onCancel();
        setContent(DEFAULT_PV_TEMPLATE);
      }}
    >
      <Form
        form={form}
        className={'h-[100px]'}
        validateMessages={{
          required: i18nInstance.t(
            'required_field',
            "'${name}' is required",
          ),
        }}
      >
        <Flex>
          <Form.Item
            name='cluster'
            label='Cluster'
            required
            rules={[{ required: true }]}
          >
            <Select
              disabled={mode === 'edit'}
              options={clusterOptionsFormated}
              loading={isClusterDataLoading}
              showSearch
              style={{
                width: 200,
              }}
            />
          </Form.Item>
        </Flex>
      </Form>
      <TextareaWithUpload
        height="540px"
        defaultLanguage="yaml"
        value={content}
        options={{
          lineNumbers: 'on',
          fontSize: 15,
          minimap: {
            enabled: false,
          },
          wordWrap: 'on',
        }}
        onChange={handleEditorChange}
        hideUploadButton={mode === 'edit'}
        checkContent={(data) => {
          if (data.err) return false;
          try {
            const validation = validateYaml(data.data as string);
            return validation.valid;
          } catch (e) {
            return false;
          }
        }}
      />
    </Modal>
  );
};

export default PersistentVolumeEditorModal;
