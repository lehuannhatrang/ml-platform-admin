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

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Button, message, Alert, Spin, Divider, Tabs, Upload, Flex } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { GetCustomResourceDefinitionByName } from '@/services';
import TextareaWithUpload from '@/components/textarea-with-upload';
import { UploadOutlined } from '@ant-design/icons';
import { useCluster } from '@/hooks';
import yaml from 'yaml';

interface CustomResourceDefinitionEditModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (crdData: any) => Promise<void>;
    crdName: string;
    clusterName: string;
    isNew?: boolean;
}

const { Option } = Select;
const { TabPane } = Tabs;

interface CRDForm {
    name: string;
    group: string;
    scope: string;
    kind: string;
    plural: string;
    singular: string;
    listKind: string;
    shortNames: string;
    categories: string;
    clusterName: string;
    spec: any;
}

interface FileContent {
    key: string;
    name: string;
    content: string;
}

const defaultYamlContent = `# Custom Resource Definition Template
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  # name must match the spec fields below, and be in the form: <plural>.<group>
  name: widgets.example.com
spec:
  # group name to use for REST API: /apis/<group>/<version>
  group: example.com
  # list of versions supported by this CustomResourceDefinition
  versions:
    - name: v1
      # Each version can be enabled/disabled by Served flag.
      served: true
      # One and only one version must be marked as the storage version.
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                size:
                  type: string
                color:
                  type: string
            status:
              type: object
              properties:
                state:
                  type: string
  # either Namespaced or Cluster
  scope: Namespaced
  names:
    # plural name to be used in the URL: /apis/<group>/<version>/<plural>
    plural: widgets
    # singular name to be used as an alias on the CLI and for display
    singular: widget
    # kind is normally the CamelCased singular type. Your resource manifests use this.
    kind: Widget
    # shortNames allow shorter string to match your resource on the CLI
    shortNames:
    - wg`;
    
const CustomResourceDefinitionEditModal: React.FC<CustomResourceDefinitionEditModalProps> = ({
    open,
    onClose,
    onSave,
    crdName,
    clusterName,
    isNew = false,
}) => {
    const [form] = Form.useForm<CRDForm>();
    // In create mode, enforce YAML view
    const [view, setView] = useState<'basic' | 'yaml'>(isNew ? 'yaml' : 'basic');
    const [saving, setSaving] = useState(false);
    const { clusterOptions } = useCluster({});
    const [selectedClusterName, setSelectedClusterName] = useState<string>(clusterName);
    
    // Multiple file support

    const [fileContents, setFileContents] = useState<FileContent[]>([
        { key: '1', name: 'crd.yaml', content: defaultYamlContent }
    ]);
    const [activeTabKey, setActiveTabKey] = useState<string>('1');

    // Function to check if a file is the unmodified default file
    const isDefaultFile = (content: string): boolean => {
        return content === defaultYamlContent;
    };

    // Force YAML view for create mode
    useEffect(() => {
        if (isNew) {
            setView('yaml');
        }
    }, [isNew]);

    const { data, isLoading, error } = useQuery({
        queryKey: ['get-crd-details-for-edit', selectedClusterName, crdName],
        queryFn: async () => {
            // If this is a new CRD, don't fetch anything
            if (isNew) {
                return null;
            }
            const response = await GetCustomResourceDefinitionByName({
                cluster: selectedClusterName,
                crdName: crdName,
            });
            return response.data?.crd;
        },
        enabled: open && ((!!crdName && !!selectedClusterName) || isNew),
    });

    // Initialize form values when data is loaded
    useEffect(() => {
        if (isNew) {
            // Initialize with default values for a new CRD
            form.setFieldsValue({
                name: '',
                group: '',
                scope: 'Namespaced',
                kind: '',
                plural: '',
                singular: '',
                listKind: '',
                shortNames: '',
                categories: '',
                clusterName: selectedClusterName,
            });
            
            // Set default empty content
            // setYamlContent('{}');
            setFileContents([{ key: '1', name: 'File 1', content: defaultYamlContent }]);
        } else if (data) {
            form.setFieldsValue({
                name: data.metadata?.name,
                group: data.spec?.group,
                scope: data.spec?.scope,
                kind: data.spec?.names?.kind,
                plural: data.spec?.names?.plural,
                singular: data.spec?.names?.singular,
                listKind: data.spec?.names?.listKind,
                shortNames: data.spec?.names?.shortNames?.join(', ') || '',
                categories: data.spec?.names?.categories?.join(', ') || '',
                clusterName: selectedClusterName,
            });
            
            // Initialize YAML content for the first tab
            if (data.spec) {
                try {
                    const specString = JSON.stringify(data.spec, null, 2);
                    // Always ensure we have a string
                    // setYamlContent(specString ? specString : '{}');
                    setFileContents([{ key: '1', name: 'File 1', content: specString || defaultYamlContent }]);
                } catch (e) {
                    console.error('Error stringifying spec:', e);
                    // setYamlContent('{}');
                }
            }
        }
    }, [data, form, isNew, selectedClusterName]);

    // Handle cluster change
    const handleClusterChange = (value: string) => {
        const clusterName = clusterOptions.find(cluster => cluster.value === value)?.label || '';
        setSelectedClusterName(clusterName);
        form.setFieldValue('clusterName', clusterName);
    };

    // Handle file upload
    const handleFileUpload = async (file: File) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                // Create a new file entry
                const newFileKey = (fileContents.length + 1).toString();
                const newFile: FileContent = {
                    key: newFileKey,
                    name: file.name,
                    content: content
                };
                
                setFileContents(prevContents => {
                    // If we only have the default file and it's unmodified, remove it
                    if (prevContents.length === 1 && isDefaultFile(prevContents[0].content)) {
                        return [newFile];
                    }
                    // Otherwise, add the new file to the list
                    return [...prevContents, newFile];
                });
                setActiveTabKey(newFileKey);
                
                message.success(`File "${file.name}" uploaded successfully`);
            } catch (error) {
                console.error('Error processing file:', error);
                message.error('Failed to process file');
            }
        };
        
        reader.readAsText(file);
        
        // Prevent default upload behavior
        return false;
    };
    
    // Handle multiple file uploads
    const handleMultipleFileUpload = async (fileList: File[]) => {
        interface UploadResult {
            name: string;
            content: string | null;
            error: any;
        }
        
        const uploadPromises = fileList.map(file => {
            return new Promise<UploadResult>((resolve) => {
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    try {
                        const content = e.target?.result as string;
                        resolve({
                            name: file.name,
                            content: content,
                            error: null
                        });
                    } catch (error) {
                        console.error('Error processing file:', error);
                        resolve({
                            name: file.name,
                            content: null,
                            error: error
                        });
                    }
                };
                
                reader.onerror = (error) => {
                    resolve({
                        name: file.name,
                        content: null,
                        error: error
                    });
                };
                
                reader.readAsText(file);
            });
        });
        
        const results = await Promise.all(uploadPromises);
        
        // Process successful uploads
        const successfulUploads = results.filter(result => !result.error && result.content);
        
        if (successfulUploads.length > 0) {
            let lastKeyAdded = '';
            
            // Add each file as a new tab
            setFileContents(prevContents => {
                let nextContents: FileContent[] = [];
                
                // If we only have the default file and it's unmodified, don't include it
                if (!(prevContents.length === 1 && isDefaultFile(prevContents[0].content))) {
                    nextContents = [...prevContents];
                }
                
                // Add the new files
                successfulUploads.forEach(result => {
                    const newFileKey = (nextContents.length + 1).toString();
                    nextContents.push({
                        key: newFileKey,
                        name: result.name,
                        content: result.content as string
                    });
                    lastKeyAdded = newFileKey;
                });
                
                return nextContents;
            });
            
            // Set the last tab added as active
            setTimeout(() => {
                if (lastKeyAdded) {
                    setActiveTabKey(lastKeyAdded);
                }
            }, 0);
            
            message.success(`${successfulUploads.length} file(s) uploaded successfully`);
        }
        
        // Report errors
        const failedUploads = results.filter(result => result.error);
        if (failedUploads.length > 0) {
            message.error(`Failed to upload ${failedUploads.length} file(s)`);
        }
        
        return false;
    };

    // Handle tab changes
    const handleTabChange = (activeKey: string) => {
        setActiveTabKey(activeKey);
    };

    // Handle content change for a specific tab
    const handleContentChange = (content: string, key: string) => {
        setFileContents(prevContents => 
            prevContents.map(item => 
                item.key === key ? { ...item, content } : item
            )
        );
    };

    // Add a new empty tab
    const addNewTab = () => {
        const newFileKey = (fileContents.length + 1).toString();
        const newFile: FileContent = {
            key: newFileKey,
            name: `File ${newFileKey}`,
            content: '{}'
        };
        setFileContents([...fileContents, newFile]);
        setActiveTabKey(newFileKey);
    };

    // Remove a tab
    const removeTab = (targetKey: string) => {
        // Don't allow removing the last tab
        if (fileContents.length <= 1) {
            return;
        }

        const newContents = fileContents.filter(item => item.key !== targetKey);
        setFileContents(newContents);

        // Set active tab to the first tab if the active tab is removed
        if (activeTabKey === targetKey) {
            setActiveTabKey(newContents[0].key);
        }
    };

    // Get all file contents as an array
    const mergeFileContents = () => {
        try {
            // Parse each file content
            const parsedContents = fileContents.map(file => {
                try {
                    // Determine if content is JSON or YAML
                    let fileContent = file.content.trim();
                    let parsedContent;
                    
                    // Try to parse as JSON first
                    if (fileContent.startsWith('{') || fileContent.startsWith('[')) {
                        try {
                            parsedContent = JSON.parse(fileContent);
                        } catch (jsonError) {
                            // If JSON parsing fails, try YAML
                            parsedContent = yaml.parse(fileContent);
                        }
                    } else {
                        // Assume YAML
                        parsedContent = yaml.parse(fileContent);
                    }
                    
                    return parsedContent;
                } catch (e) {
                    throw new Error(`Failed to parse content in file "${file.name}": ${e}`);
                }
            });
            
            // Return array of all parsed contents
            return parsedContents;
        } catch (error) {
            message.error(`${error}`);
            return null;
        }
    };

    const handleSubmit = async () => {
        try {
            setSaving(true);
            
            if (view === 'basic') {
                // Submit with basic form values
                const basicValues = await form.validateFields();
                
                if (isNew) {
                    // Create a new CRD object
                    const newCrd = {
                        clusterName: basicValues.clusterName,
                        metadata: {
                            name: `${basicValues.plural}.${basicValues.group}`,
                        },
                        spec: {
                            group: basicValues.group,
                            scope: basicValues.scope,
                            names: {
                                kind: basicValues.kind,
                                plural: basicValues.plural,
                                singular: basicValues.singular || basicValues.plural.toLowerCase(),
                                listKind: basicValues.listKind || `${basicValues.kind}List`,
                                shortNames: basicValues.shortNames ? basicValues.shortNames.split(',').map((s: string) => s.trim()) : [],
                                categories: basicValues.categories ? basicValues.categories.split(',').map((s: string) => s.trim()) : [],
                            },
                            versions: [
                                {
                                    name: 'v1',
                                    served: true,
                                    storage: true,
                                    schema: {
                                        openAPIV3Schema: {
                                            type: 'object',
                                            properties: {
                                                spec: {
                                                    type: 'object',
                                                    properties: {},
                                                    additionalProperties: true,
                                                },
                                                status: {
                                                    type: 'object',
                                                    properties: {},
                                                    additionalProperties: true,
                                                },
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    };
                    
                    try {
                        await onSave(newCrd);
                        message.success('CRD created successfully');
                        onClose();
                    } catch (error) {
                        console.error('Failed to create CRD:', error);
                        message.error('Failed to create CRD');
                    }
                } else {
                    // Update existing CRD
                    const updatedCrd = {
                        ...data,
                        clusterName: basicValues.clusterName,
                        metadata: {
                            ...data?.metadata,
                        },
                        spec: {
                            ...data?.spec,
                            group: basicValues.group,
                            scope: basicValues.scope,
                            names: {
                                ...data?.spec?.names,
                                kind: basicValues.kind,
                                plural: basicValues.plural,
                                singular: basicValues.singular,
                                listKind: basicValues.listKind,
                                shortNames: basicValues.shortNames ? basicValues.shortNames.split(',').map((s: string) => s.trim()) : [],
                                categories: basicValues.categories ? basicValues.categories.split(',').map((s: string) => s.trim()) : [],
                            }
                        },
                    };
                    
                    try {
                        await onSave(updatedCrd);
                        message.success('CRD updated successfully');
                        onClose();
                    } catch (error) {
                        console.error('Failed to update CRD:', error);
                        message.error('Failed to update CRD');
                    }
                }
            } else {
                // For YAML view, use all content from all tabs
                const parsedSpecs = mergeFileContents();
                
                if (!parsedSpecs || parsedSpecs.length === 0) {
                    setSaving(false);
                    return; // Error already shown in mergeFileContents
                }
                
                const basicValues = await form.validateFields(['clusterName']);
                
                if (isNew) {
                    // Create new CRDs from YAML content
                    // Extract the specs from each parsed file
                    const specs = parsedSpecs.map(spec => spec.spec || spec);
                    
                    // Create a single CRD object with an array of specs
                    const newCrd = {
                        clusterName: basicValues.clusterName,
                        metadata: {
                            name: parsedSpecs[0].metadata?.name || (parsedSpecs[0].spec?.names?.plural && parsedSpecs[0].spec?.group
                                ? `${parsedSpecs[0].spec.names.plural}.${parsedSpecs[0].spec.group}`
                                : parsedSpecs[0].metadata?.name || ''),
                            ...parsedSpecs[0].metadata,
                        },
                        spec: specs,
                    };
                    
                    try {
                        await onSave(newCrd);
                        message.success(`${specs.length} CRD(s) created successfully`);
                        onClose();
                    } catch (error) {
                        console.error('Failed to create CRDs:', error);
                        message.error('Failed to create CRDs');
                    }
                } else {
                    // Update existing CRD
                    // For update we only use the first spec since we're editing a single CRD
                    const spec = parsedSpecs[0].spec || parsedSpecs[0];
                    
                    const updatedCrd = {
                        ...data,
                        clusterName: basicValues.clusterName,
                        metadata: {
                            ...data?.metadata,
                            ...parsedSpecs[0].metadata,
                        },
                        spec: spec,
                    };
                    
                    try {
                        await onSave(updatedCrd);
                        message.success('CRD updated successfully');
                        onClose();
                    } catch (error) {
                        console.error('Failed to update CRD:', error);
                        message.error('Failed to update CRD');
                    }
                }
            }
        } catch (error) {
            console.error('Form validation failed:', error);
            message.error('Please check the form for errors');
        } finally {
            setSaving(false);
        }
    };

    // Reset file contents and form
    const resetForm = () => {
        // Reset form fields
        form.resetFields();
        
        // Reset file contents to initial state with one empty file
        setFileContents([{
            key: '1',
            name: 'crd.yaml',
            content: defaultYamlContent
        }]);
        
        // Reset active tab
        setActiveTabKey('1');
        
        // Reset view to appropriate mode
        setView(isNew ? 'yaml' : 'basic');
    };
    
    // Handle modal close with cleanup
    const handleModalClose = () => {
        resetForm();
        onClose();
    };

    // Render YAML editor section with tabs
    const renderYamlEditor = () => {
        return (
            <div>
                <Flex  align='center' justify='space-between'>
                    {renderClusterSelection()}
                    <Upload
                        beforeUpload={(file, fileList) => {
                            // When single file is selected, process it directly
                            if (fileList.length === 1) {
                                handleFileUpload(file);
                                return false;
                            }
                            
                            // For multiple files, wait until the last file is processed
                            if (file === fileList[fileList.length - 1]) {
                                handleMultipleFileUpload(fileList);
                            }
                            return false;
                        }}
                        showUploadList={false}
                        multiple
                        accept=".yaml,.yml,.json"
                    >
                        <Button icon={<UploadOutlined />}>Upload Files</Button>
                    </Upload>
                </Flex>
                
                <Tabs
                    activeKey={activeTabKey}
                    onChange={handleTabChange}
                    type="editable-card"
                    onEdit={(targetKey, action) => {
                        if (action === 'add') {
                            addNewTab();
                        } else if (action === 'remove' && typeof targetKey === 'string') {
                            removeTab(targetKey);
                        }
                    }}
                    className="crd-edit-tabs"
                >
                    {fileContents.map(file => (
                        <TabPane 
                            tab={file.name} 
                            key={file.key}
                            closable={fileContents.length > 1}
                        >
                            <TextareaWithUpload
                                height="500px"
                                defaultLanguage="yaml"
                                value={file.content}
                                hideUploadButton
                                checkContent={(data) => !data.err}
                                onChange={(value: string | undefined) => {
                                    handleContentChange(value ?? '{}', file.key);
                                }}
                            />
                        </TabPane>
                    ))}
                </Tabs>
            </div>
        );
    };

    // Render basic information form
    const renderBasicInfo = () => {
        return (
            <Form
                form={form}
                layout="vertical"
                className='overflow-y-auto'
            >
                <Form.Item
                    name="clusterName"
                    label="Cluster"
                    rules={[{ required: true, message: 'Cluster is required' }]}
                >
                    <Select 
                        onChange={handleClusterChange} 
                        disabled={!isNew} // Disable cluster selection in edit mode
                    >
                        {clusterOptions
                            .filter(option => option.value !== 'ALL')
                            .map(cluster => (
                                <Option key={cluster.value} value={cluster.value}>
                                    {cluster.label}
                                </Option>
                            ))}
                    </Select>
                </Form.Item>

                {isNew ? (
                    <Form.Item
                        name="name"
                        label="Name"
                        extra="Name will be automatically generated as plural.group"
                    >
                        <Input disabled />
                    </Form.Item>
                ) : (
                    <Form.Item
                        name="name"
                        label="Name"
                        rules={[{ required: true, message: 'Name is required' }]}
                    >
                        <Input disabled />
                    </Form.Item>
                )}

                <Form.Item
                    name="group"
                    label="Group"
                    rules={[{ required: true, message: 'Group is required' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="scope"
                    label="Scope"
                    rules={[{ required: true, message: 'Scope is required' }]}
                >
                    <Select>
                        <Option value="Namespaced">Namespaced</Option>
                        <Option value="Cluster">Cluster</Option>
                    </Select>
                </Form.Item>
                <Divider orientation="left">Names</Divider>
                <Form.Item
                    name="kind"
                    label="Kind"
                    rules={[{ required: true, message: 'Kind is required' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="plural"
                    label="Plural"
                    rules={[{ required: true, message: 'Plural name is required' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="singular"
                    label="Singular"
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="listKind"
                    label="List Kind"
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="shortNames"
                    label="Short Names (comma-separated)"
                >
                    <Input placeholder="e.g., cr, crs" />
                </Form.Item>
                <Form.Item
                    name="categories"
                    label="Categories (comma-separated)"
                >
                    <Input placeholder="e.g., all, api-extensions" />
                </Form.Item>
            </Form>
        );
    };

    // Render cluster selection for YAML mode
    const renderClusterSelection = () => {
        return (
            <Form
                form={form}
                layout="vertical"
            >
                <Form.Item
                    name="clusterName"
                    label="Target Cluster"
                    rules={[{ required: true, message: 'Cluster is required' }]}
                >
                    <Select 
                        onChange={handleClusterChange} 
                        disabled={!isNew} // Disable cluster selection in edit mode
                        style={{ width: '200px' }}
                    >
                        {clusterOptions
                            .filter(option => option.value !== 'ALL')
                            .map(cluster => (
                                <Option key={cluster.value} value={cluster.value}>
                                    {cluster.label}
                                </Option>
                            ))}
                    </Select>
                </Form.Item>
            </Form>
        );
    };

    // Render content for the modal
    const renderContent = () => {
        if (isLoading && !isNew) return <Spin size="large" />;
        if (error && !isNew) return <Alert type="error" message="Failed to load CRD details" />;
        if (!data && !isNew) return <Alert type="error" message="No CRD information available" />;

        return (
            <div>
                {!isNew && (
                    <div className="mb-4">
                        <Select 
                            value={view} 
                            onChange={(value: 'basic' | 'yaml') => setView(value)}
                            style={{ width: 200 }}
                        >
                            <Option value="basic">Basic Information</Option>
                            <Option value="yaml">YAML</Option>
                        </Select>
                    </div>
                )}
                
                {view === 'basic' ? renderBasicInfo() : renderYamlEditor()}
            </div>
        );
    };

    return (
        <Modal
            title={isNew ? 'Create New Custom Resource Definition' : `Edit Custom Resource Definition: ${crdName}`}
            open={open}
            onCancel={handleModalClose}
            width={1000}
            footer={[
                <Button key="cancel" onClick={handleModalClose}>
                    Cancel
                </Button>,
                <Button
                    key="save"
                    type="primary"
                    onClick={handleSubmit}
                    loading={saving}
                >
                    {isNew ? 'Create' : 'Save'}
                </Button>
            ]}
        >
            {renderContent()}
        </Modal>
    );
};

export default CustomResourceDefinitionEditModal;
