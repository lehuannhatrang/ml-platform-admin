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

import { FC, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button, Drawer, Space, message } from 'antd';
import { IResponse } from '@/services/base.ts';
import { parse } from 'yaml';
import _ from 'lodash';
import axios from 'axios';

export interface NamespaceEditorDrawerProps {
  open: boolean;
  mode: 'create' | 'edit' | 'detail';
  name?: string;
  namespaceContent?: string;
  onClose: () => void;
  onUpdate: (ret: IResponse<string>) => void;
  onCreate: (ret: IResponse<string>) => void;
}

// Default template for namespace
const defaultTemplate = `apiVersion: v1
kind: Namespace
metadata:
  name: example-namespace
  labels:
    name: example-namespace
`;

function getTitle(
  mode: NamespaceEditorDrawerProps['mode'],
  name: string = '',
) {
  switch (mode) {
    case 'create':
      return 'Create Namespace';
    case 'edit':
      return `Edit Namespace: ${name}`;
    case 'detail':
      return `Namespace Details: ${name}`;
    default:
      return '';
  }
}

const NamespaceEditorDrawer: FC<NamespaceEditorDrawerProps> = (props) => {
  const {
    open,
    mode,
    name,
    namespaceContent,
    onClose,
    onCreate,
    onUpdate,
  } = props;
  
  const [content, setContent] = useState<string>(
    namespaceContent || defaultTemplate
  );
  
  const [messageApi] = message.useMessage();

  useEffect(() => {
    if (namespaceContent) {
      setContent(namespaceContent);
    } else if (mode === 'create') {
      setContent(defaultTemplate);
    }
  }, [namespaceContent, mode]);

  function handleEditorChange(value: string | undefined) {
    setContent(value || '');
  }

  const handleSaveClick = async () => {
    try {
      const yamlObject = parse(content);
      
      if (!yamlObject) {
        messageApi.error('Invalid YAML format');
        return;
      }

      // Ensure the kind is Namespace
      const expectedKind = 'namespace';
      if (yamlObject.kind?.toLowerCase() !== expectedKind) {
        console.log(`Kind: ${yamlObject.kind}, Expected: ${expectedKind}`);
        messageApi.error(`Kind must be Namespace`);
        return;
      }

      const resourceName = _.get(yamlObject, 'metadata.name');
      
      if (!resourceName) {
        messageApi.error('Namespace name is required');
        return;
      }

      if (mode === 'edit') {
        // Use the raw API for updating namespaces
        const response = await axios.put(
          `/api/v1/_raw/namespace/name/${resourceName}`,
          yamlObject
        );
        onUpdate({
          code: response.status,
          data: 'Updated successfully',
          message: 'Namespace updated successfully'
        });
      } else {
        // For creation, use the raw API
        const response = await axios.post(
          `/api/v1/_raw/namespace/name/${resourceName}`,
          yamlObject
        );
        
        onCreate({
          code: response.status,
          data: 'Created successfully',
          message: 'Namespace created successfully'
        });
      }
    } catch (error) {
      messageApi.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <Drawer
      open={open}
      title={getTitle(mode, name)}
      width={800}
      styles={{
        body: {
          padding: 0,
        },
      }}
      closeIcon={false}
      onClose={onClose}
      footer={
        <div className="flex flex-row justify-end">
          <Space>
            <Button onClick={onClose}>
              Cancel
            </Button>
            {mode !== 'detail' && (
              <Button
                type="primary"
                onClick={handleSaveClick}
              >
                Save
              </Button>
            )}
          </Space>
        </div>
      }
    >
      <Editor
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
    </Drawer>
  );
};

export default NamespaceEditorDrawer;
