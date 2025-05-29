import React, { useState, useEffect, useMemo } from 'react';
import {
  Form,
  Input,
  Button,
  Select,
  Modal,
  Typography,
  Alert,
  Card,
  Steps,
  message,
  Radio,
  Spin,
  Checkbox,
  Divider,
  Row,
  Col,
} from 'antd';
import { Repository, GetRepositories, getRepositoryGroup, RepositoryContentType, RepositoryContentDetails } from '@/services/package';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CreatePackageRev, getCloneTask, getInitTask, GetPackageRevs, PackageRev, PackageRevisionLifecycle } from '@/services/package-revision';

const { Option } = Select;
const { Title, Text } = Typography;
const { Step } = Steps;

// Creation Method Types
export enum CreationMethod {
  FROM_SCRATCH = 'fromScratch',
  CLONE_DEPLOYMENT = 'cloneDeployment',
  CLONE_TEAM_BLUEPRINT = 'cloneTeamBlueprint',
  CLONE_ORGANIZATIONAL_BLUEPRINT = 'cloneOrganizationalBlueprint',
  CLONE_EXTERNAL_BLUEPRINT = 'cloneExternalBlueprint',
  CLONE_FUNCTION = 'cloneFunction',
}

export const creationMethodMap: Record<RepositoryContentType, CreationMethod> = {
  [RepositoryContentType.DEPLOYMENT]: CreationMethod.CLONE_DEPLOYMENT,
  [RepositoryContentType.TEAM_BLUEPRINT]: CreationMethod.CLONE_TEAM_BLUEPRINT,
  [RepositoryContentType.EXTERNAL_BLUEPRINT]: CreationMethod.CLONE_EXTERNAL_BLUEPRINT,
  [RepositoryContentType.ORGANIZATION_BLUEPRINT]: CreationMethod.CLONE_ORGANIZATIONAL_BLUEPRINT,
  [RepositoryContentType.FUNCTION]: CreationMethod.CLONE_FUNCTION,
}

export const creationMethodLabelMap: Record<CreationMethod, string> = {
  [CreationMethod.FROM_SCRATCH]: 'Create a new package from scratch',
  [CreationMethod.CLONE_DEPLOYMENT]: 'Clone a Deployment',
  [CreationMethod.CLONE_TEAM_BLUEPRINT]: 'Clone a Team Blueprint',
  [CreationMethod.CLONE_ORGANIZATIONAL_BLUEPRINT]: 'Clone an Organizational Blueprint',
  [CreationMethod.CLONE_EXTERNAL_BLUEPRINT]: 'Clone an External Blueprint',
  [CreationMethod.CLONE_FUNCTION]: 'Clone a Function',
}

export interface PackageFormValues {
  // Basic details
  creationMethod: CreationMethod;
  name: string;
  description?: string;
  keywords?: string[];
  site?: string;
  
  // Source details
  repository: string;
  directory?: string;
  revision?: string;
  packagePath?: string;
  sourceRepository?: string;
  sourcePackage?: string;
  
  // Namespace settings
  useSameNamespace: boolean;
  addNamespaceResource: boolean;
  namespace?: string;
  
  // Validation
  validateResources: boolean;
  
  // Lifecycle
  lifecycle: PackageRevisionLifecycle;
  destination?: string;
}

export interface AddPackageProps {
  title?: string;
  // The group name (Deployment, Team Blueprint, etc.)
  groupName: string;
  // The repository object
  repository: Repository;
  // Whether this is displayed in a modal
  isModal?: boolean;
  isOpen?: boolean;
  // Callback when closing the form
  onClose?: () => void;
  // Callback on successful creation
  onSuccess?: () => void;
  // Size of the modal if isModal is true
  size?: 'small' | 'medium' | 'large';
  isCreateCluster?: boolean;
}

const AddPackage: React.FC<AddPackageProps> = ({
  title,
  groupName,
  repository,
  isModal = false,
  isOpen = false,
  onClose,
  onSuccess,
  size = 'medium',
  isCreateCluster = false,
}) => {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [creationMethod, setCreationMethod] = useState<CreationMethod>(CreationMethod.FROM_SCRATCH);
  const [useSameNamespace, setUseSameNamespace] = useState(true);
  const [addNamespaceResource, setAddNamespaceResource] = useState(false);
  const [validateResources, setValidateResources] = useState(true);
  const [sourceRepository, setSourceRepository] = useState('');
  const repoContentGroup = useMemo(() => getRepositoryGroup(repository), [repository]);
  
  
  // Fetch package revisions for cloning options
  const { data: packageRevisions, isLoading: packagesLoading } = useQuery({
    queryKey: ['GetAllPackageRevs'],
    queryFn: async () => {
      const data = await GetPackageRevs();
      return data.items || [];
    },
    enabled: creationMethod !== CreationMethod.FROM_SCRATCH,
  });
  
  // Fetch all repositories
  const { data: allRepositories, isLoading: reposLoading } = useQuery({
    queryKey: ['GetAllRepositories'],
    queryFn: async () => {
      const result = await GetRepositories({
        itemsPerPage: 100,
        page: 1,
      });
      return result.data.resources || [];
    },
    enabled: true,
  });
  
  // Group repositories by type based on their labels/annotations
  const groupedRepositories = React.useMemo(() => {
    if (!allRepositories) return { deployments: [], teamBlueprints: [], organizationalBlueprints: [], externalBlueprints: [] };
    
    // Use the same grouping logic as in the package-manage page
    const deployments: Repository[] = [];
    const teamBlueprints: Repository[] = [];
    const externalBlueprints: Repository[] = [];
    const organizationalBlueprints: Repository[] = [];
    
    allRepositories.forEach(repo => {
      const group = getRepositoryGroup(repo)
      // Determine group based on the criteria from package-manage page
      // Deployment group: repo.spec?.deployment is true
      if (group === RepositoryContentType.DEPLOYMENT) {
        deployments.push(repo);
      }
      // External blueprints: repo.metadata?.labels?.['kpt.dev/repository-content'] is "external-blueprints"
      else if (group === RepositoryContentType.EXTERNAL_BLUEPRINT) {
        externalBlueprints.push(repo);
      }
      // Team Blueprints: repo.metadata?.annotations?.['nephio.org/staging'] is "true"
      else if (group === RepositoryContentType.TEAM_BLUEPRINT) {
        teamBlueprints.push(repo);
      }
      // Default to organizational blueprints
      else {
        organizationalBlueprints.push(repo);
      }
    });
    
    return {
      deployments,
      teamBlueprints,
      externalBlueprints,
      organizationalBlueprints,
    };
  }, [allRepositories]);
  
  // Get source repositories based on selected creation method
  const sourceRepositories = React.useMemo(() => {
    if (!groupedRepositories) return [];
    
    switch(creationMethod) {
      case CreationMethod.CLONE_TEAM_BLUEPRINT:
        return groupedRepositories.teamBlueprints;
      case CreationMethod.CLONE_ORGANIZATIONAL_BLUEPRINT:
        return groupedRepositories.organizationalBlueprints;
      case CreationMethod.CLONE_EXTERNAL_BLUEPRINT:
        return groupedRepositories.externalBlueprints;
      default:
        return [];
    }
  }, [creationMethod, groupedRepositories]);
  
  // Get packages for selected source repository
  const sourcePackages = React.useMemo(() => {
    if (!packageRevisions || !sourceRepository) return [];
    
    const selectedRepo = sourceRepository;
    const packages = new Set<{value: string, label: string}>();
    
    packageRevisions
      .filter(rev => rev.spec.repository === selectedRepo && !!rev.metadata?.labels?.['kpt.dev/latest-revision'])
      .forEach(rev => {
        if (rev.spec.packageName) {
          packages.add({value: rev.metadata.name, label: rev.spec.packageName});
        }
      });

    return Array.from(packages);
  }, [packageRevisions, sourceRepository]);

  // Reset form fields when creation method changes
  useEffect(() => {
    // Reset source repository and package fields whenever creation method changes
    setSourceRepository('');
    form.setFieldsValue({
      sourceRepository: undefined,
      sourcePackage: undefined,
    });
  }, [creationMethod, form]);
  
  // Reset source package when source repository changes
  useEffect(() => {
    if (sourceRepository) {
      form.setFieldsValue({
        sourcePackage: undefined,
      });
    }
  }, [sourceRepository, form]);

  // Create package mutation using the actual API
  const createPackageMutation = useMutation({
    mutationFn: async (values: PackageFormValues) => {
      const baseTask = values.sourcePackage
      ? getCloneTask(values.sourcePackage)
      : getInitTask(values?.description || '', values?.keywords || [], values?.site || '');

      const tasks = [baseTask];
      // Prepare the package revision data
      const packageData: PackageRev = {
        apiVersion: 'porch.kpt.dev/v1alpha1',
        kind: 'PackageRevision',
        metadata: {
          name: '',
        },
        spec: {
          packageName: values.name,
          workspaceName: 'v1',
          repository: values.repository,
          lifecycle: values.lifecycle,
          tasks,
        },
      };
      const { data } = await CreatePackageRev(packageData);
      return data;
    },
    onSuccess: () => {
      message.success('Package created successfully');
      form.resetFields();
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      message.error(`Failed to create package: ${error}`);
    },
  });

  const handleFinish = async () => {
    try {
      // First validate to ensure required fields are filled
      await form.validateFields();
      
      // Then get all form values including those with defaults
      const submitData = form.getFieldsValue(true);
      const packageData = {
        ...submitData,
        repository: repository.metadata.name,
        creationMethod,
        useSameNamespace,
        addNamespaceResource: useSameNamespace && addNamespaceResource,
        validateResources,
      };
      
      // Submit the form
      createPackageMutation.mutate(packageData);
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const nextStep = () => {
    form.validateFields().then(() => {
      setCurrentStep(currentStep + 1);
    });
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const cloneToContentType = useMemo(() => 
    Object.values(RepositoryContentType)
    .filter((contentType) => RepositoryContentDetails[contentType].cloneTo.find((cloneTo) => cloneTo.content === repoContentGroup))
  , [repoContentGroup]);

  const steps = [
    {
      title: 'Creation Method',
      content: (
        <>
          <Form.Item
            name="creationMethod"
            label={isCreateCluster ? "Create Cluster from a Package" : "Creation Method"}
            initialValue={CreationMethod.FROM_SCRATCH}
          >
            <Radio.Group 
              onChange={(e) => setCreationMethod(e.target.value)}
              value={creationMethod}
            >
              <div className="mb-2">
                <Radio value={CreationMethod.FROM_SCRATCH}>{creationMethodLabelMap[CreationMethod.FROM_SCRATCH]}</Radio>
              </div>
              {cloneToContentType.map((contentType) => {
                const creationMethod = creationMethodMap[contentType];
                return (
                  <div className="mb-2">
                    <Radio value={creationMethod}>{creationMethodLabelMap[creationMethod]}</Radio>
                  </div>
                )
              })}
            </Radio.Group>
          </Form.Item>

          {creationMethod !== CreationMethod.FROM_SCRATCH && (
            <>
              <Divider />
              <Form.Item
                name="sourceRepository"
                label="Source Repository"
                required={true}
                rules={[{ required: true, message: 'Please select a source repository' }]}
              >
                <Select 
                  placeholder="Select source repository"
                  loading={reposLoading || packagesLoading}
                  disabled={sourceRepositories.length === 0}
                  onChange={(value) => {
                    setSourceRepository(value);
                  }}
                >
                  {sourceRepositories.map(repo => (
                    <Option key={repo.metadata.name} value={repo.metadata.name}>
                      {repo.metadata.name}
                      {repo.spec.description && ` - ${repo.spec.description}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="sourcePackage"
                label="Source Package"
                required={true}
                rules={[{ required: true, message: 'Please select a source package' }]}
              >
                <Select 
                  placeholder="Select source package"
                  loading={packagesLoading}
                  disabled={!form.getFieldValue('sourceRepository') || sourcePackages.length === 0}
                >
                  {sourcePackages.map(pkg => (
                    <Option key={pkg.value} value={pkg.value}>{pkg.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}
        </>
      ),
    },
    {
      title: 'Package Metadata',
      content: (
        <>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="name"
                label={isCreateCluster ? "Cluster Name" : "Package Name"}
                rules={[
                  { required: true, message: 'Please enter a ' + (isCreateCluster ? 'cluster name' : 'package name' ) },
                  { pattern: /^[a-z0-9][a-z0-9\-]*$/, message: `${isCreateCluster ? 'Cluster name' : 'Package name'} must consist of lowercase alphanumeric characters or "-"` },
                ]}
              >
                <Input placeholder={isCreateCluster ? "my-cluster" : "my-package"} />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="description"
                label="Description"
              >
                <Input.TextArea rows={2} placeholder={isCreateCluster ? "Cluster description" : "Package description"} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="keywords"
                label="Keywords"
                tooltip="Optional keywords to describe the package (comma-separated)"
              >
                <Select
                  mode="tags"
                  placeholder="Enter keywords"
                  tokenSeparators={[',']}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="site"
                label="Site"
                tooltip="Optional URL for package documentation or homepage"
              >
                <Input placeholder="https://example.com" />
              </Form.Item>
            </Col>
          </Row>

          
        </>
      ),
    },
    {
      title: 'Namespace Configuration',
      content: (
        <>
          <Form.Item>
            <div className="mb-4">
              <Checkbox 
                checked={useSameNamespace}
                onChange={(e) => setUseSameNamespace(e.target.checked)}
              >
                <span className="font-medium">Set the same namespace for all namespace scoped resources</span>
              </Checkbox>
              <div className="ml-6 mt-1 text-gray-500">
                This ensures that all resources have the namespace that can be easily changed in a single place. 
                The namespace can either be static or set to the name of a deployment when a deployment instance is created.
              </div>
            </div>
            
            {useSameNamespace && (
              <div className="ml-6 mb-4">
                <Checkbox 
                  checked={addNamespaceResource}
                  onChange={(e) => setAddNamespaceResource(e.target.checked)}
                >
                  <span className="font-medium">Add namespace resource to the deployment</span>
                </Checkbox>
                <div className="ml-6 mt-1 text-gray-500">
                  If checked, a namespace resource will be added to the deployment.
                </div>
              </div>
            )}
            
            {useSameNamespace && addNamespaceResource && (
              <Form.Item
                name="namespace"
                label="Namespace"
                className="ml-6"
                rules={[{ required: useSameNamespace && addNamespaceResource, message: 'Please enter a namespace' }]}
              >
                <Input placeholder="my-namespace" />
              </Form.Item>
            )}
          </Form.Item>
        </>
      ),
    },
    {
      title: 'Validation',
      content: (
        <>
          <Form.Item>
            <div className="mb-4">
              <Checkbox 
                checked={validateResources}
                onChange={(e) => setValidateResources(e.target.checked)}
              >
                <span className="font-medium">Validate resources for any OpenAPI schema errors</span>
              </Checkbox>
              <div className="ml-6 mt-1 text-gray-500">
                When enabled, all resources will be validated against their OpenAPI schema definitions before 
                being added to the package. This helps identify potential issues early in the development process.
              </div>
            </div>
          </Form.Item>
          
          <Divider />
          
          <Form.Item
            name="lifecycle"
            label="Initial Lifecycle"
            initialValue={PackageRevisionLifecycle.DRAFT}
            tooltip="The initial lifecycle state of the package"
          >
            <Select>
              <Option value={PackageRevisionLifecycle.DRAFT}>Draft</Option>
              <Option value={PackageRevisionLifecycle.PROPOSED}>Proposed</Option>
              <Option value={PackageRevisionLifecycle.PUBLISHED}>Published</Option>
            </Select>
          </Form.Item>
          
          <Alert
            message="Lifecycle Information"
            description={(
              <>
                <Text>The lifecycle controls the visibility and availability of the package:</Text>
                <ul>
                  <li><strong>Draft</strong>: Package is being actively developed and not ready for consumption</li>
                  <li><strong>Proposed</strong>: Package is ready for review and consideration</li>
                  <li><strong>Published</strong>: Package is approved and available for consumption</li>
                </ul>
              </>
            )}
            type="info"
            showIcon
          />
        </>
      ),
    },
  ];

  const formContent = (
    <div>
      <Steps current={currentStep} className="mb-8">
        {steps.map(item => (
          <Step key={item.title} title={item.title} />
        ))}
      </Steps>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          lifecycle: PackageRevisionLifecycle.DRAFT,
        }}
      >
        <div className="steps-content">{steps[currentStep].content}</div>

        <div className="steps-action mt-6">
          {currentStep > 0 && (
            <Button style={{ marginRight: 8 }} onClick={prevStep}>
              Previous
            </Button>
          )}
          {currentStep < steps.length - 1 && (
            <Button type="primary" onClick={nextStep}>
              Next
            </Button>
          )}
          {currentStep === steps.length - 1 && (
            <Button 
              type="primary" 
              htmlType="submit"
              loading={createPackageMutation.isPending}
            >
              Create Package
            </Button>
          )}
          {isModal && onClose && (
            <Button style={{ marginLeft: 8 }} onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      </Form>
    </div>
  );

  // Show loading if needed
  if (createPackageMutation.isPending) {
    return <Spin tip="Creating package...">{formContent}</Spin>;
  }

  // Render as modal or standalone component
  if (isModal) {
    const modalWidth = size === 'small' ? 520 : size === 'large' ? 920 : 720;

    return (
      <Modal
        title={<Title level={4}>{title || `Add Package to ${groupName}`}</Title>}
        open={isOpen}
        onCancel={onClose}
        footer={null}
        width={modalWidth}
      >
        {formContent}
      </Modal>
    );
  }

  return (
    <Card title={<Title level={4}>Add Package to {groupName}</Title>}>
      {formContent}
    </Card>
  );
};

export default AddPackage;
