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
import { FC, useEffect, useMemo, useState } from 'react';
import { Form, Modal, Select, Flex } from 'antd';
import Editor from '@monaco-editor/react';
import { parse } from 'yaml';
import _ from 'lodash';
import { CreateMemberResource, PutMemberResource } from '@/services/unstructured';
import { IResponse, ServiceKind } from '@/services/base.ts';
import { useCluster } from '@/hooks';
export interface NewWorkloadEditorModalProps {
  mode: 'create' | 'edit' | 'detail';
  open: boolean;
  serviceContent?: string;
  onOk: (ret: IResponse<any>) => Promise<void> | void;
  onCancel: () => Promise<void> | void;
  kind: ServiceKind;
  cluster: string;
}
const ServiceEditorModal: FC<NewWorkloadEditorModalProps> = (props) => {
  const { mode, open, serviceContent = '', onOk, onCancel, kind, cluster: clusterName } = props;

  const [form] = Form.useForm<{
    kind: ServiceKind;
    cluster: string;
  }>();

  const [content, setContent] = useState<string>(serviceContent);
  useEffect(() => {
    setContent(serviceContent);
  }, [serviceContent]);
  function handleEditorChange(value: string | undefined) {
    setContent(value || '');
  }
  const { clusterOptions, isClusterDataLoading } = useCluster({ allowSelectAll: false });

  const clusterOptionsFormated = useMemo(() => {
    return clusterOptions.map((item) => {
      return {
        label: item.label,
        value: item.label,
      };
    });
  }, [clusterOptions]);

  useEffect(() => {
    form.setFieldsValue({
      kind,
      cluster: clusterName,
    });
  }, [kind, clusterName]);

  return (
    <Modal
      title={
        mode === 'create'
          ? i18nInstance.t('c7961c290ec86485d8692f3c09b4075b', '新增服务')
          : mode === 'edit'
            ? i18nInstance.t('cc51f34aa418cb3a596fd6470c677bfe', '编辑服务')
            : i18nInstance.t('ad23e7bbdbe6ed03eebfc27eef7570fa', '查看服务')
      }
      open={open}
      width={1000}
      okText={i18nInstance.t('38cf16f2204ffab8a6e0187070558721', '确定')}
      cancelText={i18nInstance.t('625fb26b4b3340f7872b411f401e754c', '取消')}
      destroyOnClose={true}
      onOk={async () => {
        // await onOk()
        try {
          const yamlObject = parse(content) as Record<string, string>;
          const kind = _.get(yamlObject, 'kind');
          const namespace = _.get(yamlObject, 'metadata.namespace', 'default');
          const name = _.get(yamlObject, 'metadata.name');
          const submitData = await form.validateFields();
          if (mode === 'create') {
            const ret = await CreateMemberResource({
              kind,
              namespace: namespace,
              content: yamlObject,
              cluster: submitData.cluster,
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
            label={i18nInstance.t('924f67de61fc9e07fff979306900dc6a', '服务类型')}
          >
            <Select
              value={kind}
              disabled
              options={[
                {
                  label: 'Service',
                  value: ServiceKind.Service,
                },
                {
                  label: 'Ingress',
                  value: ServiceKind.Ingress,
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
      <Editor
        height="520px"
        defaultLanguage="yaml"
        value={content}
        theme="vs"
        options={{
          theme: 'vs',
          lineNumbers: 'on',
          fontSize: 15,
          readOnly: mode === 'detail',
          minimap: {
            enabled: false,
          },
          wordWrap: 'on',
        }}
        onChange={handleEditorChange}
      />
    </Modal>
  );
};
export default ServiceEditorModal;
