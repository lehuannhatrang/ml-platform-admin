import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Input, Button, Divider, message, Select, Row, Col } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { ArgoProject, CreateArgoProject, UpdateArgoProject } from '@/services/argocd';
import useCluster from '@/hooks/use-cluster';

interface EditProjectModalProps {
  mode: 'create' | 'edit';
  open: boolean;
  cluster: string;
  project?: ArgoProject;
  onCancel: () => void;
  onSuccess: () => void;
}

const EditProjectModal: React.FC<EditProjectModalProps> = ({
  mode,
  open,
  project,
  onCancel,
  onSuccess,
  cluster: clusterName,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const { clusterOptions, isClusterDataLoading } = useCluster({ allowSelectAll: false });
  const clusterOptionsFormated = useMemo(() => {
    return clusterOptions.map((item) => {
      return {
        label: item.label,
        value: item.label,
      };
    });
  }, [clusterOptions]);

  // Reset form when modal opens or project/mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && project) {
        // Pre-fill form with project data for editing
        form.setFieldsValue({
          cluster: clusterName,
          name: project.metadata?.name,
          description: project.spec?.description || '',
          sourceRepos: project.spec?.sourceRepos || [''],
          destinations: (project.spec?.destinations || [{ namespace: '*', server: '*' }]).map(dest => ({
            namespace: dest.namespace,
            server: dest.server
          })),
        });
      } else {
        // Reset form for create mode
        form.resetFields();
        form.setFieldsValue({
          sourceRepos: ['*'],
          destinations: [{ namespace: '*', server: '*' }],
        });
      }
    }
  }, [open, mode, project, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // Prepare data for API
      const projectData = {
        metadata: {
          name: values.name,
        },
        spec: {
          description: values.description,
          sourceRepos: values.sourceRepos.filter((repo: string) => repo.trim() !== ''),
          destinations: values.destinations.filter(
            (dest: { namespace: string; server: string }) => 
              dest.namespace?.trim() !== '' && dest.server?.trim() !== ''
          ),
        },
      };

      // Call API based on mode
      let response;
      if (mode === 'create') {
        response = await CreateArgoProject(values.cluster, projectData);
      } else {
        response = await UpdateArgoProject(clusterName, projectData);
      }
      if (response.code === 200) {
        message.success(`Project ${mode === 'create' ? 'created' : 'updated'} successfully`);
        onSuccess();
      } else {
        throw new Error(response.message || 'Unknown error');
      }
    } catch (error: any) {
      message.error(`Failed to ${mode} project: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={mode === 'create' ? 'Create Project' : `Edit Project: ${project?.metadata?.name}`}
      open={open}
      width={800}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={submitting}
          onClick={handleSubmit}
        >
          {mode === 'create' ? 'Create' : 'Update'}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        validateMessages={{
          required: "'${name}' is required",
        }}
      >
        <Row gutter={[16, 16]}>
          <Col span={12}>
        <Form.Item
          name="name"
          label="Project Name"
          rules={[{ required: true }]}
          tooltip="A unique name for this project"
        >
          <Input disabled={mode === 'edit'} placeholder="e.g., my-project" />
        </Form.Item>
          </Col>
          <Col span={12}>
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
              />
        </Form.Item>
          </Col>
        </Row>


        <Form.Item
          name="description"
          label="Description"
          tooltip="Optional description for this project"
        >
          <Input.TextArea rows={2} placeholder="Brief description of the project's purpose" />
        </Form.Item>

        <Divider orientation="left">Source Repositories</Divider>
        <Form.List name="sourceRepos">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field, index) => (
                <Form.Item
                  key={field.key}
                  label={index === 0 ? "Repository URL" : ""}
                  required={index === 0}
                >
                  <div className="flex">
                    <Form.Item
                      {...field}
                      noStyle
                      rules={[
                        { 
                          required: index === 0,
                          message: 'Please input a repository URL or remove this field' 
                        }
                      ]}
                    >
                      <Input placeholder="e.g., https://github.com/myorg/myrepo.git" style={{ width: '90%' }} />
                    </Form.Item>
                    {fields.length > 1 ? (
                      <MinusCircleOutlined
                        className="ml-2 mt-2"
                        onClick={() => remove(field.name)}
                      />
                    ) : null}
                  </div>
                </Form.Item>
              ))}
              <Form.Item>
                <Button 
                  type="dashed" 
                  onClick={() => add()} 
                  icon={<PlusOutlined />}
                  className="w-full"
                >
                  Add Repository
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <Divider orientation="left">Destination Resources</Divider>
        <Form.List name="destinations">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field, index) => (
                <div key={field.key} className="mb-4">
                  <div className="flex justify-between">
                    <div className="text-sm font-medium mb-2">
                      {index === 0 ? "Destination" : `Destination ${index + 1}`}
                    </div>
                    {fields.length > 1 && (
                      <MinusCircleOutlined
                        onClick={() => remove(field.name)}
                        className="text-red-500"
                      />
                    )}
                  </div>
                  <div className="flex gap-4">
                    <Form.Item
                      {...field}
                      name={[field.name, 'namespace']}
                      label="Namespace"
                      className="w-1/2"
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="e.g., default or * for all" />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'server']}
                      label="Server"
                      className="w-1/2"
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="e.g., https://kubernetes.default.svc or * for in-cluster" />
                    </Form.Item>
                  </div>
                </div>
              ))}
              <Form.Item>
                <Button 
                  type="dashed" 
                  onClick={() => add({ namespace: '', server: '' })} 
                  icon={<PlusOutlined />}
                  className="w-full"
                >
                  Add Destination
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
};

export default EditProjectModal;
