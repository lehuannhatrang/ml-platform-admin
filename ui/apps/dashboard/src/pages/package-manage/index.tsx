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

import Panel from '@/components/panel';
import { useQuery } from '@tanstack/react-query';
import { Repository, PackageRev, GetRepositories, GetPackageRevs, CreateRepository, UpdateRepository, DeleteRepository, PackageRevisionLifecycle } from '@/services/package';
import {
  Table,
  TableColumnProps,
  Space,
  Button,
  message,
  Popconfirm,
  Flex,
  Tag,
  Tabs,
  Modal,
  Form,
  Select,
  Input as AntInput,
  Card,
  Typography,
  Row,
  Col,
  List,
  Statistic,
  Spin
} from 'antd';
import { Icons } from '@/components/icons';
import { useMemo, useState } from 'react';
import { CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

// Repository group types
type RepositoryGroupType = 'deployments' | 'teamBlueprints' | 'externalBlueprints' | 'organizationalBlueprints';

interface RepositoryGroup {
  type: RepositoryGroupType;
  title: string;
  repositories: Repository[];
  published: number;
  drafts: number;
}

const PackageManagePage = () => {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [repositoryModalVisible, setRepositoryModalVisible] = useState(false);
  const [editingRepository, setEditingRepository] = useState<Repository | null>(null);
  const [form] = Form.useForm();

  // Query for repositories
  const { data: repoData, isLoading: repoLoading, refetch: refetchRepos } = useQuery({
    queryKey: ['GetRepositories'],
    queryFn: async () => {
      const ret = await GetRepositories({
        itemsPerPage: 100,
        page: 1,
      });
      return ret;
    },
  });
  
  // Query for package revisions
  const { data: packageRevData, isLoading: packageRevLoading } = useQuery({
    queryKey: ['GetPackageRevs'],
    queryFn: async () => {
      const ret = await GetPackageRevs();
      return ret;
    },
  });
  
  // Combined loading state
  const isLoading = repoLoading || packageRevLoading;
  
  // Function to refetch all data
  const refetch = () => {
    refetchRepos();
  };

  const handleAddRepository = () => {
    form.resetFields();
    setEditingRepository(null);
    setRepositoryModalVisible(true);
  };

  const handleEditRepository = (repository: Repository) => {
    setEditingRepository(repository);
    form.setFieldsValue({
      name: repository.metadata.name,
      description: repository.spec.description || '',
      type: repository.spec.type,
      git_repo: repository.spec.git?.repo || '',
      git_branch: repository.spec.git?.branch || '',
      oci_registry: repository.spec.oci?.registry || '',
    });
    setRepositoryModalVisible(true);
  };

  const handleRepositoryFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      const repositoryData: any = {
        apiVersion: 'config.porch.kpt.dev/v1alpha1',
        kind: 'Repository',
        metadata: {
          name: values.name,
        },
        spec: {
          description: values.description,
          type: values.type,
        }
      };

      // Add git or oci specific fields based on type
      if (values.type === 'git') {
        repositoryData.spec.git = {
          repo: values.git_repo,
          branch: values.git_branch || 'main',
        };
      } else if (values.type === 'oci') {
        repositoryData.spec.oci = {
          registry: values.oci_registry,
        };
      }

      let response;
      if (editingRepository) {
        // Update existing repository
        response = await UpdateRepository(values.name, repositoryData);
        if (response) {
          messageApi.success('Repository updated successfully');
        }
      } else {
        // Create new repository
        response = await CreateRepository(repositoryData);
        if (response) {
          messageApi.success('Repository created successfully');
        }
      }

      setRepositoryModalVisible(false);
      refetch();
    } catch (error) {
      console.error('Form validation failed:', error);
      messageApi.error('Failed to save repository');
    }
  };

  const handleDeleteRepository = async (name: string) => {
    try {
      await DeleteRepository(name);
      messageApi.success(`Repository '${name}' deleted successfully`);
      refetch();
    } catch (error) {
      console.error('Failed to delete repository:', error);
      messageApi.error(`Failed to delete repository '${name}'`);
    }
  };

  const columns: TableColumnProps<Repository>[] = [
    {
      title: 'Name',
      key: 'name',
      width: 250,
      render: (_, r) => r.metadata.name,
    },
    {
      title: 'Type',
      dataIndex: ['spec', 'type'],
      key: 'type',
      width: 100,
      render: (type) => {
        if (type === 'git') {
          return <Tag color="blue">Git</Tag>;
        } else if (type === 'oci') {
          return <Tag color="green">OCI</Tag>;
        } else {
          return <Tag>{type}</Tag>;
        }
      },
    },
    {
      title: 'Repository',
      key: 'repository',
      render: (_, r) => {
        if (r.spec.git?.repo || r.spec.oci?.registry) {
          return <Typography.Link href={r.spec.git?.repo || r.spec.oci?.registry} target='_blank'>
            {r.spec.git?.repo || r.spec.oci?.registry}
          </Typography.Link>;
        } 
        return '-';
      },
    },
    {
        title: 'Branch',
        dataIndex: ['spec', 'git', 'branch'],
        key: 'branch',
        width: 250,
        render: (branch) => <Tag color="orange">{branch}</Tag>,
    },
    {
        title: 'Path',
        dataIndex: ['spec', 'git', 'directory'],
        key: 'path',
        width: 250,
        render: (path) => <Tag>{path}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, r) => {
        return (
          <Space.Compact>
            <Button
              size={'small'}
              type="link"
              onClick={() => handleEditRepository(r)}
            >
              Edit
            </Button>
            <Popconfirm
              placement="topRight"
              title={`Are you sure you want to delete repository '${r.metadata.name}'?`}
              onConfirm={() => handleDeleteRepository(r.metadata.name)}
              okText="Confirm"
              cancelText="Cancel"
            >
              <Button size={'small'} type="link" danger>
                Delete
              </Button>
            </Popconfirm>
          </Space.Compact>
        );
      },
    },
  ];

  // Group repositories by type and determine published/draft status from PackageRevs
  const groupRepositories = useMemo(() => {
    if (!repoData || !packageRevData) {
      return [];
    }
    const repositories = repoData?.data?.resources || [];
    const packageRevs = packageRevData?.items || [];
    // Create map of repository name to package revisions
    const packageRevsByRepo: Record<string, PackageRev[]> = {};
    
    // Map to store published and draft counts for each repository
    const repoStats: Record<string, { published: number; drafts: number }> = {};
    
    // Group package revs by repository
    packageRevs
    .forEach((rev: PackageRev) => {
      const repoName = rev.spec?.repository;
      if (repoName) {
        if (!packageRevsByRepo[repoName]) {
          packageRevsByRepo[repoName] = [];
          repoStats[repoName] = { published: 0, drafts: 0 };
        }
        packageRevsByRepo[repoName].push(rev);
        
        // Count published and draft revisions
        if (rev.metadata.labels?.['kpt.dev/latest-revision'] === 'true' && rev.spec?.lifecycle === PackageRevisionLifecycle.PUBLISHED) {
          repoStats[repoName].published += 1;
        } else if (rev.spec?.lifecycle === PackageRevisionLifecycle.DRAFT) {
          repoStats[repoName].drafts += 1;
        }
      }
    });
    
    // Create repository groups
    const groups: Record<RepositoryGroupType, RepositoryGroup> = {
      deployments: {
        type: 'deployments',
        title: 'Deployments',
        repositories: [],
        published: 0,
        drafts: 0
      },
      teamBlueprints: {
        type: 'teamBlueprints',
        title: 'Team Blueprints',
        repositories: [],
        published: 0,
        drafts: 0
      },
      externalBlueprints: {
        type: 'externalBlueprints',
        title: 'External Blueprints',
        repositories: [],
        published: 0,
        drafts: 0
      },
      organizationalBlueprints: {
        type: 'organizationalBlueprints',
        title: 'Organizational Blueprints',
        repositories: [],
        published: 0,
        drafts: 0
      }
    };
    
    // Group repositories based on the specified criteria
    repositories.forEach((repo: Repository) => {
      // Determine group based on the specified criteria
        let group: RepositoryGroupType = 'organizationalBlueprints'; // Default group
        
        // Deployment group: repo.spec?.deployment is true
        if (repo.spec?.deployment === true) {
        group = 'deployments';
        }
        // External blueprints: repo.metadata?.labels?.['kpt.dev/repository-content'] is "external-blueprints"
        else if (repo.metadata?.labels?.['kpt.dev/repository-content'] === 'external-blueprints') {
        group = 'externalBlueprints';
        }
        // Team Blueprints: repo.metadata?.annotations?.['nephio.org/staging'] is "true"
        else if (repo.metadata?.annotations?.['nephio.org/staging'] === 'true') {
        group = 'teamBlueprints';
        }
        
        // Add repository with its stats to the appropriate group
        const repoWithStats = {
          ...repo,
          __stats: repoStats[repo.metadata?.name || ''] || { published: 0, drafts: 0 }
        };
        groups[group].repositories.push(repoWithStats);
        
        // Get package revs for this repository
        const repoPackageRevs = packageRevsByRepo[repo.metadata?.name || ''] || [];
        
        // Use PackageRevisionLifecycle to determine published and draft status
        const publishedRevs = repoPackageRevs.filter(rev => rev.metadata.labels?.['kpt.dev/latest-revision'] === 'true' && rev.spec?.lifecycle === PackageRevisionLifecycle.PUBLISHED);
        const draftRevs = repoPackageRevs.filter(rev => rev.spec?.lifecycle === PackageRevisionLifecycle.DRAFT);
        // Update counts based on the package revisions lifecycle
        groups[group].published += publishedRevs.length;
        groups[group].drafts += draftRevs.length;
    });
    
    return Object.values(groups);
  }, [repoData, packageRevData]);
  
  // Generate columns for each group table
  const getColumnsForGroup = (groupType: RepositoryGroupType) => {
    // Create a copy of the base columns
    const groupColumns = [...columns];
    
    // Get the title based on group type
    const titleMap: Record<RepositoryGroupType, string> = {
      'deployments': 'Deployments',
      'teamBlueprints': 'Team Blueprints',
      'externalBlueprints': 'External Blueprints',
      'organizationalBlueprints': 'Organizational Blueprints'
    };
    
    // Add a status column specific to the group type
    groupColumns.splice(5, 0, {
      title: titleMap[groupType] || 'Packages',
      key: 'packageStats',
      width: 150,
      render: (_, r: any) => {
        const stats = r.__stats || { published: 0, drafts: 0 };
        return (
          <Space>
            {stats.published > 0 && (
              <Tag color="success">
                <CheckCircleOutlined /> {stats.published} Published
              </Tag>
            )}
            {stats.drafts > 0 && (
              <Tag color="processing">
                <InfoCircleOutlined /> {stats.drafts} Draft
              </Tag>
            )}
            {stats.published === 0 && stats.drafts === 0 && (
              <Text type="secondary">-</Text>
            )}
          </Space>
        );
      },
    });
    
    return groupColumns;
  };
  
  // Render a repository group card
  const renderGroupCard = (group: RepositoryGroup) => {
    return (
      <Card
        title={<Title level={4}>{group.title}</Title>}
        className="mb-4 shadow-md"
        actions={[<Button type="link">View details</Button>]}
      >
        <div className="mb-4">
          <Flex justify='space-between'>
              <Statistic title="Repositories" value={group.repositories.length} />
              <Statistic 
                title="Published" 
                value={group.published}
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              />
              <Statistic 
                title="Drafts" 
                value={group.drafts}
                prefix={<InfoCircleOutlined style={{ color: '#1890ff' }} />}
              />
          </Flex>
        </div>

        <Typography.Text strong>
          Repositories
        </Typography.Text>
        
        <List
          size="small"
          dataSource={group.repositories.slice(0, 5)} // Show only first 5
          renderItem={(repo: Repository) => (
            <List.Item>
              <Space>
                {repo.spec.type === 'git' && <Tag color="blue">Git</Tag>}
                {repo.spec.type === 'oci' && <Tag color="green">OCI</Tag>}
                <Text>{repo.metadata?.name}</Text>
              </Space>
              <div>
                <Typography.Link href={repo.spec?.git?.repo || repo.spec?.oci?.registry} target='_blank'>
                  {repo.spec?.git?.repo || repo.spec?.oci?.registry}
                </Typography.Link>
              </div>
            </List.Item>
          )}
        />
      </Card>
    );
  };

  return (
    <Spin spinning={isLoading}>
        <Panel showSelectCluster={false}>
        {messageContextHolder}
        
        <Tabs defaultActiveKey="dashboard">
            <TabPane tab="Dashboard" key="dashboard">
            <div className="p-4">
                <Row gutter={[16, 16]}>
                {groupRepositories.map(group => (
                    <Col xs={24} lg={12} key={group.type}>
                    {renderGroupCard(group)}
                    </Col>
                ))}
                </Row>
            </div>
            </TabPane>
            
            <TabPane tab="Repository" key="repository">
            <Flex justify='end' className='mb-4'>
                <Button
                    type={'primary'}
                    icon={<Icons.add width={16} height={16} />}
                    className="flex flex-row items-center"
                    onClick={handleAddRepository}
                >
                    Add Repository
                </Button>
            </Flex>
            
            <div className="space-y-8">
              {groupRepositories.map(group => (
                <Card title={group.title} key={group.type} className="mb-4">

                  <Flex className="mb-2" gap={16}>
                    <div>
                      <span className="text-gray-500 mr-2">Repositories:</span>
                      <span className="font-semibold">{group.repositories.length}</span>
                    </div>
                    <div>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} className="mr-1" />
                      <span className="text-gray-500 mr-2">Published:</span>
                      <span className="font-semibold">{group.published}</span>
                    </div>
                    <div>
                      <InfoCircleOutlined style={{ color: '#1890ff' }} className="mr-1" />
                      <span className="text-gray-500 mr-2">Drafts:</span>
                      <span className="font-semibold">{group.drafts}</span>
                    </div>
                  </Flex>
                  <Table
                    rowKey={(r: Repository) => r.metadata.name || ''}
                    columns={getColumnsForGroup(group.type)}
                    dataSource={group.repositories}
                    pagination={group.repositories.length > 10 ? { pageSize: 10 } : false}
                    size="small"
                  />
                </Card>
              ))}
            </div>
            </TabPane>
        </Tabs>

        <Modal
            title={editingRepository ? 'Edit Repository' : 'Add Repository'}
            open={repositoryModalVisible}
            onOk={handleRepositoryFormSubmit}
            onCancel={() => setRepositoryModalVisible(false)}
            width={600}
        >
            <Form
            form={form}
            layout="vertical"
            name="repositoryForm"
            initialValues={{
                type: 'git',
            }}
            >
            <Form.Item
                name="name"
                label="Repository Name"
                rules={[{ required: true, message: 'Please enter repository name' }]}
            >
                <AntInput disabled={!!editingRepository} />
            </Form.Item>
            
            <Form.Item
                name="description"
                label="Description"
            >
                <AntInput.TextArea rows={2} />
            </Form.Item>
            
            <Form.Item
                name="type"
                label="Repository Type"
                rules={[{ required: true, message: 'Please select repository type' }]}
            >
                <Select>
                <Select.Option value="git">Git</Select.Option>
                <Select.Option value="oci">OCI</Select.Option>
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
                        <AntInput placeholder="https://github.com/example/repo.git" />
                        </Form.Item>
                        
                        <Form.Item
                        name="git_branch"
                        label="Branch"
                        >
                        <AntInput placeholder="main" />
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
                        <AntInput placeholder="gcr.io/example/repo" />
                    </Form.Item>
                    );
                }
                
                return null;
                }}
            </Form.Item>
            </Form>
        </Modal>
        </Panel>
    </Spin>
  );
};

export default PackageManagePage;
