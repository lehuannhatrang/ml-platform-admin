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
import { Modal, Form, Input, Select, Button, message, Alert, Spin, Divider, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { GetCustomResourceDefinitionByName } from '@/services';
import TextareaWithUpload from '@/components/textarea-with-upload';

interface CustomResourceDefinitionEditModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (crdData: any) => Promise<void>;
    crdName: string;
    clusterName: string;
}

const { Option } = Select;
const { Text } = Typography;

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
    spec: any;
}

const CustomResourceDefinitionEditModal: React.FC<CustomResourceDefinitionEditModalProps> = ({
    open,
    onClose,
    onSave,
    crdName,
    clusterName,
}) => {
    const [form] = Form.useForm<CRDForm>();
    const [view, setView] = useState<'basic' | 'yaml'>('basic');
    const [saving, setSaving] = useState(false);
    const [yamlContent, setYamlContent] = useState<string>('{}');

    const { data, isLoading, error } = useQuery({
        queryKey: ['get-crd-details-for-edit', clusterName, crdName],
        queryFn: async () => {
            const response = await GetCustomResourceDefinitionByName({
                cluster: clusterName,
                crdName: crdName,
            });
            return response.data?.crd;
        },
        enabled: open && !!crdName && !!clusterName,
    });

    // Initialize form values when data is loaded
    useEffect(() => {
        if (data) {
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
            });
            
            // Initialize YAML content
            if (data.spec) {
                try {
                    const specString = JSON.stringify(data.spec, null, 2);
                    // Always ensure we have a string
                    setYamlContent(specString ? specString : '{}');
                } catch (e) {
                    console.error('Error stringifying spec:', e);
                    setYamlContent('{}');
                }
            }
        }
    }, [data, form]);

    const handleSubmit = async () => {
        try {
            setSaving(true);
            
            let updatedCrd;
            
            if (view === 'basic') {
                // Submit with basic form values
                const basicValues = await form.validateFields();
                updatedCrd = {
                    ...data,
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
            } else {
                // Submit with YAML content
                let parsedSpec;
                try {
                    parsedSpec = JSON.parse(yamlContent);
                } catch (e) {
                    message.error('Invalid JSON in YAML editor');
                    setSaving(false);
                    return;
                }
                
                updatedCrd = {
                    ...data,
                    metadata: {
                        ...data?.metadata,
                    },
                    spec: parsedSpec,
                };
            }
            
            try {
                await onSave(updatedCrd);
                message.success('CRD updated successfully');
                onClose();
            } catch (error) {
                console.error('Failed to update CRD:', error);
                message.error('Failed to update CRD');
            } finally {
                setSaving(false);
            }
        } catch (error) {
            console.error('Validation failed:', error);
            setSaving(false);
        }
    };

    // Render YAML editor section
    const renderYamlEditor = () => {
        if (!data || !data.spec) {
            return <Text>No data available</Text>;
        }

        return (
            <div>
                <TextareaWithUpload
                    height="540px"
                    defaultLanguage="yaml"
                    value={yamlContent} 
                    hideUploadButton
                    checkContent={(data) => !data.err}
                    onChange={(value: string | undefined) => {
                        // Handle both string and undefined
                        setYamlContent(value ?? '{}');
                    }}
                />
            </div>
        );
    };

    // Render basic information form
    const renderBasicInfo = () => {
        return (
            <Form
                form={form}
                layout="vertical"
                className='h-[540px] overflow-y-auto'
            >
                <Form.Item
                    name="name"
                    label="Name"
                    rules={[{ required: true, message: 'Name is required' }]}
                >
                    <Input disabled />
                </Form.Item>
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

    // Render content for the modal
    const renderContent = () => {
        if (isLoading) return <Spin size="large" />;
        if (error) return <Alert type="error" message="Failed to load CRD details" />;
        if (!data) return <Alert type="error" message="No CRD information available" />;

        return (
            <div>
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
                
                <div>
                    {view === 'basic' ? renderBasicInfo() : renderYamlEditor()}
                </div>
            </div>
        );
    };

    return (
        <Modal
            title={`Edit Custom Resource Definition: ${crdName}`}
            open={open}
            onCancel={onClose}
            width={1000}
            footer={[
                <Button key="cancel" onClick={onClose}>
                    Cancel
                </Button>,
                <Button
                    key="save"
                    type="primary"
                    onClick={handleSubmit}
                    loading={saving}
                >
                    Save
                </Button>
            ]}
        >
            {renderContent()}
        </Modal>
    );
};

export default CustomResourceDefinitionEditModal;
