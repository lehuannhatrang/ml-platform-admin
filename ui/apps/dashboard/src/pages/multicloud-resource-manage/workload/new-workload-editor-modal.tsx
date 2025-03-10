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
import { Form, Modal, Select, Flex } from 'antd';
import { parse } from 'yaml';
import _ from 'lodash';
import { CreateMemberResource, PutMemberResource } from '@/services/unstructured';
import { IResponse, WorkloadKind } from '@/services/base.ts';
import { useCluster } from '@/hooks';
import TextareaWithUpload from '@/components/textarea-with-upload';
export interface NewWorkloadEditorModalProps {
  mode: 'create' | 'edit';
  open: boolean;
  kind: WorkloadKind;
  workloadContent?: string;
  onOk: (ret: IResponse<any>) => Promise<void>;
  onCancel: () => Promise<void> | void;
  cluster: string;
}

const NewWorkloadEditorModal: FC<NewWorkloadEditorModalProps> = (props) => {
  const { mode, open, workloadContent = '', onOk, onCancel, kind, cluster: clusterName } = props;
  const [content, setContent] = useState<string>(workloadContent);
  useEffect(() => {
    setContent(workloadContent);
  }, [workloadContent]);

  function handleEditorChange(value: string | undefined) {
    setContent(value || '');
  }

  const [form] = Form.useForm<{
    kind: WorkloadKind;
    cluster: string;
  }>();

  useEffect(() => {
    form.setFieldsValue({
      kind,
      cluster: clusterName,
    });
  }, [kind, clusterName]);

  const { clusterOptions, isClusterDataLoading } = useCluster({ allowSelectAll: false });
  const clusterOptionsFormated = useMemo(() => {
    return clusterOptions.map((item) => {
      return {
        label: item.label,
        value: item.label,
      };
    });
  }, [clusterOptions]);

  return (
    <Modal
      title={
        mode === 'create'
          ? i18nInstance.t('96d6b0fcc58b6f65dc4c00c6138d2ac0', '新增工作负载')
          : i18nInstance.t('634a943c97e905149acb81cef5bda28e', '编辑工作负载')
      }
      open={open}
      width={1000}
      okText={i18nInstance.t('38cf16f2204ffab8a6e0187070558721', '确定')}
      cancelText={i18nInstance.t('625fb26b4b3340f7872b411f401e754c', '取消')}
      destroyOnClose={true}
      onOk={async () => {
        try {
          const yamlObject = parse(content) as Record<string, string>;
          const kind = _.get(yamlObject, 'kind');
          const namespace = _.get(yamlObject, 'metadata.namespace');
          const name = _.get(yamlObject, 'metadata.name');
          const submitData = await form.validateFields();
          if (mode === 'create') {
            const ret = await CreateMemberResource({
              kind,
              namespace,
              cluster: submitData.cluster,
              content: yamlObject,
            });
            await onOk(ret);
            setContent('');
          } else {
            const ret = await PutMemberResource({
              kind,
              name,
              namespace,
              content: yamlObject,
              cluster: submitData.cluster,
            });
            await onOk(ret);
            setContent('');
          }
        } catch (e) {
          console.log('e', e);
        }
      }}
      onCancel={async () => {
        await onCancel();
        setContent('');
      }}
    >

      <Form
        form={form}
        className={'h-[100px]'}
        validateMessages={{
          required: i18nInstance.t(
            'e0a23c19b8a0044c5defd167b441d643',
            "'${name}' 是必选字段",
          ),
        }}
      >
        <Flex>

          <Form.Item
            name='kind'
            label={i18nInstance.t(
              '0a3e7cdadc44fb133265152268761abc',
              '工作负载类型',
            )}
          >
            <Select
              disabled
              options={[
                {
                  label: 'Deployment',
                  value: WorkloadKind.Deployment,
                },
                {
                  label: 'Statefulset',
                  value: WorkloadKind.Statefulset,
                },
                {
                  label: 'Daemonset',
                  value: WorkloadKind.Daemonset,
                },
                {
                  label: 'Cronjob',
                  value: WorkloadKind.Cronjob,
                },
                {
                  label: 'Job',
                  value: WorkloadKind.Job,
                },
              ]}
              style={{
                width: 200,
              }}
            />
          </Form.Item>
          <Form.Item
            name='cluster'
            label='Cluster'
            required
            rules={[{ required: true }]}
            className='ml-8'
          >
            <Select
              disabled={!!clusterName}
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
        theme="vs"
        options={{
          theme: 'vs',
          lineNumbers: 'on',
          fontSize: 15,
          minimap: {
            enabled: false,
          },
          wordWrap: 'on',
        }}
        onChange={handleEditorChange}
        hideUploadButton={mode === 'edit'}
        checkContent={(data) => !data.err}
      />
    </Modal>
  );
};
export default NewWorkloadEditorModal;
