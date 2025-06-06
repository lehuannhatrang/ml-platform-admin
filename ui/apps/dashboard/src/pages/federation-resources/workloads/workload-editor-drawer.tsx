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
import { parse, stringify } from 'yaml';
import _ from 'lodash';
import { PutResource } from '@/services/unstructured';
import axios from 'axios';

export interface WorkloadEditorDrawerProps {
  open: boolean;
  mode: 'create' | 'edit' | 'detail';
  type: 'deployment' | 'daemonset' | 'cronjob' | 'job';
  name?: string;
  namespace?: string;
  workloadContent?: string;
  onClose: () => void;
  onUpdate: (ret: IResponse<string>) => void;
  onCreate: (ret: IResponse<string>) => void;
}

// Default templates for different workload types
const defaultTemplates = {
  deployment: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: example-deployment
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80`,

  daemonset: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: example-daemonset
  namespace: default
spec:
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80`,
        
  cronjob: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: example-cronjob
  namespace: default
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: hello
            image: busybox
            command:
            - /bin/sh
            - -c
            - date; echo Hello from Karmada
          restartPolicy: OnFailure`,
          
  job: `apiVersion: batch/v1
kind: Job
metadata:
  name: example-job
  namespace: default
spec:
  template:
    spec:
      containers:
      - name: hello
        image: busybox
        command:
        - /bin/sh
        - -c
        - date; echo Hello from Karmada; sleep 30
      restartPolicy: Never
  backoffLimit: 4`
};

function getTitle(
  mode: WorkloadEditorDrawerProps['mode'],
  type: WorkloadEditorDrawerProps['type'],
  name: string = '',
) {
  const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1);
  
  switch (mode) {
    case 'create':
      return `Create ${typeCapitalized}`;
    case 'edit':
      return `Edit ${typeCapitalized}: ${name}`;
    case 'detail':
      return `${typeCapitalized} Details: ${name}`;
    default:
      return '';
  }
}

const WorkloadEditorDrawer: FC<WorkloadEditorDrawerProps> = (props) => {
  const {
    open,
    mode,
    type,
    name,
    namespace,
    workloadContent,
    onClose,
    onCreate,
    onUpdate,
  } = props;
  
  const [content, setContent] = useState<string>(
    defaultTemplates[type]
  );
  const [messageApi] = message.useMessage();

  useEffect(() => {
    if (workloadContent) {
      // Check if workloadContent is already a string
      if (typeof workloadContent === 'string') {
        setContent(workloadContent);
      } else {
        // If it's an object, stringify it to YAML
        try {
          setContent(stringify(workloadContent));
        } catch (error) {
          console.error('Error converting content to YAML:', error);
          messageApi.error('Error preparing content for display');
          setContent(defaultTemplates[type]);
        }
      }
    } else if (mode === 'create') {
      setContent(defaultTemplates[type]);
    }
  }, [workloadContent, mode, type, messageApi]);

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

      // Ensure the kind matches the selected type
      const expectedKind = type.toLowerCase();
      if (yamlObject.kind?.toLowerCase() !== expectedKind) {
        messageApi.error(`Kind must be ${expectedKind}`);
        return;
      }

      const resourceName = _.get(yamlObject, 'metadata.name');
      const resourceNamespace = _.get(yamlObject, 'metadata.namespace', 'default');
      
      if (!resourceName) {
        messageApi.error('Resource name is required');
        return;
      }

      if (mode === 'edit') {
        // Use different endpoints based on resource type
        if (type === 'deployment') {
          const updateRet = await PutResource({
            kind: type.toLowerCase(),
            name: name || '',
            namespace: namespace || '',
            content: yamlObject,
          });
          onUpdate(updateRet as IResponse<string>);
        } else {
          // For non-deployment resources, use the raw API
          const response = await axios.put(
            `/api/v1/_raw/${type.toLowerCase()}/namespace/${resourceNamespace}/name/${resourceName}`,
            yamlObject
          );
          onUpdate({
            code: response.status,
            data: 'Updated successfully',
            message: `${type} updated successfully`
          });
        }
      } else {
        // Creation
        if (type === 'deployment') {
          // For deployments, use the specific endpoint
          const createRet = await axios.post(`/api/v1/${type.toLowerCase()}`, {
            namespace: resourceNamespace,
            name: resourceName,
            content: content,
          });
          
          onCreate({
            code: createRet.status,
            data: 'Created successfully',
            message: `${type} created successfully`
          });
        } else {
          // For non-deployment resources, use the raw API
          const response = await axios.post(
            `/api/v1/_raw/${type.toLowerCase()}/namespace/${resourceNamespace}/name/${resourceName}`,
            yamlObject
          );
          
          onCreate({
            code: response.status,
            data: 'Created successfully',
            message: `${type} created successfully`
          });
        }
      }
    } catch (error) {
      messageApi.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <Drawer
      open={open}
      title={getTitle(mode, type, name)}
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

export default WorkloadEditorDrawer;
