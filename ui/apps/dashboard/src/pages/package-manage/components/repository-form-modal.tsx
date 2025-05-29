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

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Steps, Space, Radio, Divider, message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getRepositoryGroup, Repository, REPOSITORY_GROUPS, RepositoryContentType } from '@/services/package';
import { GetSecrets, Secret } from '@/services/config';
import { CreateMemberResource } from '@/services/unstructured';

const { Option } = Select;
const { TextArea } = Input;


export interface RepositoryFormData {
  name: string;
  description?: string;
  type: 'git' | 'oci';
  git_repo?: string;
  git_branch?: string;
  git_directory?: string;
  oci_registry?: string;
  repository_group: RepositoryContentType;
  auth_type?: 'none' | 'github_token';
  use_existing_secret?: boolean;
  secret_name?: string;
  access_token?: string;
}

interface RepositoryFormModalProps {
  visible: boolean;
  editingRepository: Repository | null;
  onCancel: () => void;
  onSubmit: (values: RepositoryFormData) => Promise<void>;
}

const RepositoryFormModal: React.FC<RepositoryFormModalProps> = ({
  visible,
  editingRepository,
  onCancel,
  onSubmit
}) => {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Use React Query to fetch secrets
  const { 
    data: secretsData, 
    isLoading: secretsLoading 
  } = useQuery({
    queryKey: ['secrets', 'default', 'mgmt-cluster'],
    queryFn: async () => {
      try {
        const response = await GetSecrets({
          namespace: 'default',
          cluster: { label: 'mgmt-cluster', value: 'mgmt-cluster' }
        });
        // Safely access and filter basic auth secrets
        const secretsList = response?.data?.secrets || [];
        return secretsList.filter((secret: Secret) => 
          secret?.typeMeta?.kind === 'secret' && 
          secret?.type === 'kubernetes.io/basic-auth'
        );
      } catch (error) {
        console.error('Failed to fetch secrets:', error);
        message.error('Failed to load authentication secrets');
        return [];
      }
    },
    enabled: visible && currentStep === 1,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false
  });
  // Access the filtered secrets list
  const secrets: Secret[] = secretsData || [];

  // Reset form and step when modal visibility changes
  useEffect(() => {
    if (visible) {
      setCurrentStep(0);
      if (editingRepository) {
        console.log({editingRepository})
        const group = getRepositoryGroup(editingRepository);
        form.setFieldsValue({
          name: editingRepository.metadata.name,
          description: editingRepository.spec.description || '',
          type: editingRepository.spec.type,
          git_repo: editingRepository.spec.git?.repo || '',
          git_branch: editingRepository.spec.git?.branch || '',
          git_directory: editingRepository.spec.git?.directory || '/',
          oci_registry: editingRepository.spec.oci?.registry || '',
          repository_group: group,
          auth_type: editingRepository.spec.git?.secretRef ? 'github_token' : 'none',
          use_existing_secret: !!editingRepository.spec.git?.secretRef,
          secret_name: editingRepository.spec.git?.secretRef?.name || '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          type: 'git',
          git_branch: 'main',
          git_directory: '/',
          repository_group: REPOSITORY_GROUPS[0].value,
          auth_type: 'none',
          use_existing_secret: false
        });
      }
    }
  }, [visible, editingRepository, form]);

  const handleNext = async () => {
    try {
      // Validate fields in the current step
      if (currentStep === 0) {
        const type = form.getFieldValue('type');
        const fieldsToValidate = [
          'name', 
          'description', 
          'type', 
          'repository_group'
        ];
        
        // Add type-specific fields to validate
        if (type === 'git') {
          fieldsToValidate.push('git_repo', 'git_branch', 'git_directory');
        } else if (type === 'oci') {
          fieldsToValidate.push('oci_registry');
        }
        
        await form.validateFields(fieldsToValidate);
      }
      
      setCurrentStep(currentStep + 1);
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleFinish = async () => {
    try {
      setLoading(true);
      // Validate only relevant fields based on selections
      const type = form.getFieldValue('type');
      const authType = form.getFieldValue('auth_type');
      const useExistingSecret = form.getFieldValue('use_existing_secret');
      
      const fieldsToValidate = ['auth_type'];
      
      if (type === 'git' && authType === 'github_token') {
        fieldsToValidate.push('use_existing_secret');
        
        if (useExistingSecret) {
          fieldsToValidate.push('secret_name');
        } else {
          fieldsToValidate.push('secret_name', 'access_token');
        }
      }
      
      await form.validateFields(fieldsToValidate);
      const values = form.getFieldsValue(true);
      
      // Create a copy of values for repository creation
      const formValues = { ...values };
      
      // Handle GitHub token authentication if needed
      if (type === 'git' && authType === 'github_token' && !useExistingSecret) {
        try {
          // Create a new secret for the GitHub token
          const secretName = values.secret_name;
          const tokenValue = values.access_token;
          
          // Create the secret resource
          const secretData = {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {
              name: secretName,
              namespace: 'default',
              annotations: {
                'porch.kpt.dev/secret-purpose': 'git',
              }
            },
            type: 'kubernetes.io/basic-auth',
            data: {
              username: btoa(secretName),
              password: btoa(tokenValue)
            }
          };
          
          // Create the secret using unstructured API
          await CreateMemberResource({
            cluster: 'mgmt-cluster',
            kind: 'secret',
            namespace: 'default',
            content: secretData
          });
          
          message.success(`Secret "${secretName}" created successfully`);
          
          // Update form values to use existing secret
          formValues.use_existing_secret = true;
          delete formValues.access_token; // Don't send the token to the API
        } catch (error) {
          console.error('Failed to create secret:', error);
          message.error('Failed to create secret');
          setLoading(false);
          return;
        }
      } else if (values.auth_type === 'none') {
        // Only include auth fields if auth type is not 'none'
        delete formValues.use_existing_secret;
        delete formValues.secret_name;
        delete formValues.access_token;
      }
      
      await onSubmit(formValues);
      
      // Reset form after successful submission
      form.resetFields();
      setCurrentStep(0);
    } catch (error) {
      console.error('Form submission failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Render the form steps
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <>
            <Form.Item
              name="name"
              label="Repository Name"
              rules={[{ required: true, message: 'Please enter repository name' }]}
            >
              <Input disabled={!!editingRepository} placeholder="Enter repository name" />
            </Form.Item>
            
            <Form.Item
              name="description"
              label="Description"
            >
              <TextArea rows={2} placeholder="Enter repository description (optional)" />
            </Form.Item>
            
            <Form.Item
              name="repository_group"
              label="Repository Content"
              rules={[{ required: true, message: 'Please select repository group' }]}
            >
              <Select placeholder="Select repository group">
                {REPOSITORY_GROUPS.map(group => (
                  <Option key={group.value} value={group.value}>{group.label}</Option>
                ))}
              </Select>
            </Form.Item>
            
            <Form.Item
              name="type"
              label="Repository Type"
              rules={[{ required: true, message: 'Please select repository type' }]}
            >
              <Select placeholder="Select repository type">
                <Option value="git">Git</Option>
                <Option value="oci">OCI</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.type !== currentValues.type
              }
            >
              {({ getFieldValue }) => {
                const type = getFieldValue('type');
                
                if (type === 'git') {
                  return (
                    <>
                      <Form.Item
                        name="git_repo"
                        label="Git Repository URL"
                        rules={[{ required: true, message: 'Please enter Git repository URL' }]}
                      >
                        <Input placeholder="https://github.com/example/repo.git" />
                      </Form.Item>
                      
                      <Form.Item
                        name="git_branch"
                        label="Branch"
                        rules={[{ required: true, message: 'Please enter branch name' }]}
                      >
                        <Input placeholder="main" />
                      </Form.Item>

                      <Form.Item
                        name="git_directory"
                        label="Directory"
                        rules={[{ required: true, message: 'Please enter directory path' }]}
                      >
                        <Input placeholder="/" />
                      </Form.Item>
                    </>
                  );
                }
                
                if (type === 'oci') {
                  return (
                    <Form.Item
                      name="oci_registry"
                      label="OCI Registry"
                      rules={[{ required: true, message: 'Please enter OCI registry' }]}
                    >
                      <Input placeholder="gcr.io/example/repo" />
                    </Form.Item>
                  );
                }
                
                return null;
              }}
            </Form.Item>
          </>
        );
      case 1:
        return (
          <>
            <Form.Item
              name="auth_type"
              label="Authentication Type"
              rules={[{ required: true, message: 'Please select authentication type' }]}
            >
              <Radio.Group>
                <Radio value="none">None</Radio>
                {form.getFieldValue('type') === 'git' && (
                  <Radio value="github_token">GitHub Access Token</Radio>
                )}
              </Radio.Group>
            </Form.Item>
            
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.auth_type !== currentValues.auth_type
              }
            >
              {({ getFieldValue }) => {
                const authType = getFieldValue('auth_type');
                
                if (authType === 'github_token') {
                  return (
                    <>
                      <Divider orientation="left">Repository Access</Divider>
                      
                      <Form.Item
                        name="use_existing_secret"
                        label="Secret Type"
                      >
                        <Radio.Group>
                          <Radio value={true}>Use existing secret</Radio>
                          <Radio value={false}>Create new secret</Radio>
                        </Radio.Group>
                      </Form.Item>
                      
                      <Form.Item
                        noStyle
                        shouldUpdate={(prevValues, currentValues) =>
                          prevValues.use_existing_secret !== currentValues.use_existing_secret
                        }
                      >
                        {({ getFieldValue }) => {
                          const useExisting = getFieldValue('use_existing_secret');
                          
                          if (useExisting) {
                            return (
                              <Form.Item
                                name="secret_name"
                                label="Secret"
                                rules={[{ required: true, message: 'Please select a secret' }]}
                              >
                                <Select 
                                  placeholder="Select secret"
                                  loading={secretsLoading}
                                  notFoundContent={secretsLoading ? 'Loading...' : 'No secrets found'}
                                >
                                  {secrets.map((secret: Secret) => (
                                    <Option key={secret.objectMeta.name} value={secret.objectMeta.name}>
                                      {secret.objectMeta.name}
                                    </Option>
                                  ))}
                                </Select>
                              </Form.Item>
                            );
                          }
                          
                          return (
                            <>
                              <Form.Item
                                name="secret_name"
                                label="Secret Name"
                                rules={[{ required: true, message: 'Please enter secret name' }]}
                                tooltip="A unique name for the secret that will be created in the cluster"
                              >
                                <Input placeholder="github-token-new" />
                              </Form.Item>
                              
                              <Form.Item
                                name="access_token"
                                label="Access Token"
                                rules={[{ required: true, message: 'Please enter GitHub access token' }]}
                                tooltip="GitHub personal access token with repo scope"
                                extra="The token will be stored securely as a Kubernetes secret"
                              >
                                <Input.Password placeholder="ghp_..." />
                              </Form.Item>
                            </>
                          );
                        }}
                      </Form.Item>
                    </>
                  );
                }
                
                return null;
              }}
            </Form.Item>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      title={editingRepository ? 'Edit Repository' : 'Add Repository'}
      open={visible}
      onCancel={onCancel}
      width={700}
      footer={null}
      maskClosable={false}
    >
      <Steps
        current={currentStep}
        items={[
          { title: 'Repository Info' },
          { title: 'Authentication' }
        ]}
        style={{ marginBottom: 24 }}
      />
      
      <Form
        form={form}
        layout="vertical"
        name="repositoryForm"
      >
        {renderStepContent()}
        
        <Form.Item style={{ marginTop: 24, textAlign: 'right' }}>
          <Space>
            {currentStep > 0 && (
              <Button onClick={handlePrev}>
                Previous
              </Button>
            )}
            
            {currentStep < 1 ? (
              <Button type="primary" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button type="primary" loading={loading} onClick={handleFinish}>
                Submit
              </Button>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RepositoryFormModal;
