import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Input, Button, Divider, message, Select, Row, Col, Switch, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { ArgoApplication, ArgoProject, CreateArgoApplication, GetArgoProjects, UpdateArgoApplication } from '@/services/argocd';
import useCluster from '@/hooks/use-cluster';
import { useQuery } from '@tanstack/react-query';

interface EditApplicationModalProps {
  mode: 'create' | 'edit';
  open: boolean;
  cluster: string;
  application?: ArgoApplication;
  onCancel: () => void;
  onSuccess: () => void;
}

const EditApplicationModal: React.FC<EditApplicationModalProps> = ({
  mode,
  open,
  application,
  onCancel,
  onSuccess,
  cluster:clusterName,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Get cluster options for the dropdown
  const { clusterOptions, isClusterDataLoading } = useCluster({ allowSelectAll: false });
  const clusterOptionsFormatted = useMemo(() => {
    return clusterOptions.map((item) => ({
      label: item.label,
      value: item.label,
    }));
  }, [clusterOptions]);

  // Fetch available projects
  const { data: projectsData, refetch: refetchProjects } = useQuery({
    queryKey: ['get-argo-projects-for-app', open, clusterName],
    queryFn: async () => {
      if (!open) return { data: { items: [] } };

      const _cluster = mode === 'create' ? form.getFieldValue('cluster') : clusterName;

      if (!_cluster) return { data: { items: [] } };
      
      const projects = await GetArgoProjects({
        selectedCluster: { value: _cluster, label: _cluster },
      });
      return projects;
    },
    enabled: open,
  });

  const projectOptions = useMemo(() => {
    return (projectsData?.data?.items || []).map((project: ArgoProject) => ({
      label: project.metadata?.name,
      value: project.metadata?.name,
    }));
  }, [projectsData]);

  // Reset form when modal opens or application/mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && application) {
        // Pre-fill form with application data for editing
        form.setFieldsValue({
          cluster: clusterName,
          name: application.metadata?.name,
          project: application.spec?.project,
          repoURL: application.spec?.source?.repoURL,
          path: application.spec?.source?.path,
          targetRevision: application.spec?.source?.targetRevision || 'HEAD',
          destinationNamespace: application.spec?.destination?.namespace,
          automated: !!application.spec?.syncPolicy?.automated,
          prune: application.spec?.syncPolicy?.automated?.prune || false,
          selfHeal: application.spec?.syncPolicy?.automated?.selfHeal || false,
        });
      } else {
        // Reset form for create mode
        form.resetFields();
        form.setFieldsValue({
          cluster: clusterName,
          targetRevision: 'HEAD',
          automated: false,
          prune: false,
          selfHeal: false,
        });
      }
    }
  }, [open, mode, application, form, clusterName]);

  // Handle form submission
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // Prepare application data for API
      const applicationData: any = {
        metadata: {
          name: values.name,
        },
        spec: {
          project: values.project,
          source: {
            repoURL: values.repoURL,
            path: values.path,
            targetRevision: values.targetRevision,
          },
          destination: {
            server: "https://kubernetes.default.svc",
            namespace: values.destinationNamespace,
          },
        },
      };

      // Add sync policy if automated is enabled
      if (values.automated) {
        applicationData.spec.syncPolicy = {
          automated: {
            prune: values.prune,
            selfHeal: values.selfHeal,
          }
        };
      }

      // Call API based on mode
      let response;
      if (mode === 'create') {
        response = await CreateArgoApplication(values.cluster, applicationData);
      } else {
        response = await UpdateArgoApplication(clusterName, applicationData);
      }
      
      if (response.code === 200) {
        message.success(`Application ${mode === 'create' ? 'created' : 'updated'} successfully`);
        onSuccess();
      } else {
        throw new Error(response.message || 'Unknown error');
      }
    } catch (error: any) {
      message.error(`Failed to ${mode} application: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={mode === 'create' ? 'Create ArgoCD Application' : 'Edit ArgoCD Application'}
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
        style={{ height: '600px', overflowY: 'auto', overflowX: 'hidden' }}
      >
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Form.Item
              name="name"
              label="Application Name"
              rules={[{ required: true }]}
              tooltip="A unique name for this application"
            >
              <Input disabled={mode === 'edit'} placeholder="e.g., my-application" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="cluster"
              label="Cluster"
              required
              rules={[{ required: true }]}
            >
              <Select
                disabled={mode === 'edit'}
                options={clusterOptionsFormatted}
                loading={isClusterDataLoading}
                onChange={() => {
                  refetchProjects();
                  form.setFieldsValue({ project: undefined });
                }}
                showSearch
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="project"
          label="Project"
          rules={[{ required: true }]}
          tooltip="Select the ArgoCD project this application belongs to"
        >
          <Select
            options={projectOptions}
            placeholder="Select a project"
            showSearch
            loading={!projectOptions.length}
          />
        </Form.Item>

        <Divider orientation="left">Source</Divider>
        
        <Form.Item
          name="repoURL"
          label="Repository URL"
          rules={[{ required: true }]}
          tooltip="Git repository URL containing the application manifests"
        >
          <Input placeholder="e.g., https://github.com/argoproj/argocd-example-apps.git" />
        </Form.Item>
        
        <Row gutter={[16, 0]}>
          <Col span={16}>
            <Form.Item
              name="path"
              label="Path"
              rules={[{ required: true }]}
              tooltip="Path within the repository containing the application manifests"
            >
              <Input placeholder="e.g., guestbook" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="targetRevision"
              label="Target Revision"
              rules={[{ required: true }]}
              tooltip="Git revision (branch, tag, or commit) to use"
            >
              <Input placeholder="e.g., HEAD, main, v1.0.0" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left">Destination</Divider>
        
        <Row gutter={[16, 0]}>
          <Col span={24}>
            <Form.Item
              name="destinationNamespace"
              label="Namespace"
              rules={[{ required: true }]}
              tooltip="The target namespace for the application"
            >
              <Input placeholder="e.g., default" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left">Sync Policy</Divider>
        
        <Form.Item
          name="automated"
          valuePropName="checked"
          label={
            <span>
              Automated Sync
              <Tooltip title="Enable automated sync to keep the application in sync with the source repository">
                <InfoCircleOutlined style={{ marginLeft: 8 }} />
              </Tooltip>
            </span>
          }
        >
          <Switch />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) => prevValues.automated !== currentValues.automated}
        >
          {({ getFieldValue }) => 
            getFieldValue('automated') ? (
              <Row gutter={[16, 0]}>
                <Col span={12}>
                  <Form.Item
                    name="prune"
                    valuePropName="checked"
                    label={
                      <span>
                        Prune Resources
                        <Tooltip title="Automatically delete resources that no longer exist in Git">
                          <InfoCircleOutlined style={{ marginLeft: 8 }} />
                        </Tooltip>
                      </span>
                    }
                  >
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="selfHeal"
                    valuePropName="checked"
                    label={
                      <span>
                        Self Heal
                        <Tooltip title="Automatically sync when resources are modified in the cluster">
                          <InfoCircleOutlined style={{ marginLeft: 8 }} />
                        </Tooltip>
                      </span>
                    }
                  >
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
            ) : null
          }
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EditApplicationModal;