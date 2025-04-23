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

import { useState, useEffect, useCallback } from 'react';
import { Drawer, Button, Typography, Space, message } from 'antd';
import { parse, stringify } from 'yaml';
import Editor from '@monaco-editor/react';
import axios from 'axios';

const { Title } = Typography;

// Editor drawer props
interface ServiceEditorDrawerProps {
  open: boolean;
  mode: 'create' | 'edit' | 'detail';
  type: 'service' | 'ingress';
  name?: string;
  namespace?: string;
  serviceContent?: string;
  onClose: () => void;
  onCreate: (ret: { code: number; message: string }) => void;
  onUpdate: (ret: { code: number; message: string }) => void;
}

// Default templates for service and ingress
const defaultServiceTemplate = `apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: default
spec:
  selector:
    app: MyApp
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP`;

const defaultIngressTemplate = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-service
            port:
              number: 80`;

const ServiceEditorDrawer: React.FC<ServiceEditorDrawerProps> = ({
  open,
  mode,
  type,
  name,
  namespace,
  serviceContent,
  onClose,
  onCreate,
  onUpdate,
}) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // Set initial content based on mode and type
  useEffect(() => {
    if (mode === 'create') {
      setContent(type === 'service' ? defaultServiceTemplate : defaultIngressTemplate);
    } else if (serviceContent) {
      // For edit or detail modes, use the provided content
      try {
        // If serviceContent is a string, use it directly
        if (typeof serviceContent === 'string') {
          setContent(serviceContent);
        } else {
          // If serviceContent is an object, stringify it
          setContent(stringify(serviceContent));
        }
      } catch (error) {
        console.error('Failed to parse service content:', error);
        messageApi.error('Failed to parse service content');
        setContent(type === 'service' ? defaultServiceTemplate : defaultIngressTemplate);
      }
    }
  }, [mode, type, serviceContent, messageApi]);

  // Handle editor content change
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value) {
      setContent(value);
    }
  }, []);

  // Validate the YAML
  const validateResource = useCallback(() => {
    try {
      const parsed = parse(content);
      
      // Check if the required fields are present
      if (!parsed) {
        messageApi.error('Invalid YAML format');
        return false;
      }
      
      // Validate the resource kind
      const expectedKind = type === 'service' ? 'Service' : 'Ingress';
      if (parsed.kind !== expectedKind) {
        messageApi.error(`Resource kind must be ${expectedKind}`);
        return false;
      }
      
      // Check for namespace
      if (!parsed.metadata?.namespace) {
        messageApi.error('Namespace is required');
        return false;
      }
      
      // Check for name
      if (!parsed.metadata?.name) {
        messageApi.error('Name is required');
        return false;
      }
      
      return {
        parsed,
        namespace: parsed.metadata.namespace,
        name: parsed.metadata.name,
      };
    } catch (error) {
      messageApi.error('Invalid YAML format');
      return false;
    }
  }, [content, type, messageApi]);

  // Handle save button click for create and edit modes
  const handleSaveClick = useCallback(async () => {
    const validation = validateResource();
    if (!validation) return;
    
    const { parsed, namespace: resourceNamespace, name: resourceName } = validation;
    
    setLoading(true);
    
    try {
      if (mode === 'create') {
        // For creation, use the resource type, namespace, and name from the YAML
        const endpoint = type === 'service' 
          ? `/api/v1/_raw/service/namespace/${resourceNamespace}/name/${resourceName}`
          : `/api/v1/_raw/ingress/namespace/${resourceNamespace}/name/${resourceName}`;
        
        const response = await axios.post(endpoint, parsed);
        
        if (response.data) {
          onCreate(response.data);
        } else {
          messageApi.error('Failed to create resource: Invalid response');
        }
      } else if (mode === 'edit') {
        // For updates, use the provided namespace and name or the ones from the YAML
        const updateNamespace = namespace || resourceNamespace;
        const updateName = name || resourceName;
        
        const endpoint = type === 'service'
          ? `/api/v1/_raw/service/namespace/${updateNamespace}/name/${updateName}`
          : `/api/v1/_raw/ingress/namespace/${updateNamespace}/name/${updateName}`;
        
        const response = await axios.put(endpoint, parsed);
        
        if (response.data) {
          onUpdate(response.data);
        } else {
          messageApi.error('Failed to update resource: Invalid response');
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred';
      messageApi.error(`Operation failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [mode, validateResource, type, name, namespace, onCreate, onUpdate, messageApi]);

  // Get drawer title based on mode and type
  const getDrawerTitle = () => {
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);
    
    if (mode === 'create') {
      return `Create ${typeName}`;
    } else if (mode === 'edit') {
      return `Edit ${typeName}: ${name}`;
    } else {
      return `${typeName} Details: ${name}`;
    }
  };

  return (
    <Drawer
      title={<Title level={4}>{getDrawerTitle()}</Title>}
      placement="right"
      width={800}
      onClose={onClose}
      open={open}
      footer={
        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            {mode !== 'detail' && (
              <Button 
                type="primary" 
                loading={loading} 
                onClick={handleSaveClick}
              >
                {mode === 'create' ? 'Create' : 'Update'}
              </Button>
            )}
          </Space>
        </div>
      }
    >
      <div style={{ height: 'calc(100vh - 200px)' }}>
        <Editor
          height="100%"
          defaultLanguage="yaml"
          value={content}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            readOnly: mode === 'detail',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>
      {contextHolder}
    </Drawer>
  );
};

export default ServiceEditorDrawer;
