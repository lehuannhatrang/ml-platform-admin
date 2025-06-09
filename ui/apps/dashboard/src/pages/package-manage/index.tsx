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
import { Repository, GetRepositories, CreateRepository, UpdateRepository, DeleteRepository, RepositoryContentType, getRepositoryGroup, RepositoryContentDetails } from '@/services/package';
import {
  Card,
  Tabs,
  Button,
  Table,
  Typography,
  Flex,
  Space,
  Tag,
  message,
  Spin,
  Form,
  List,
  Row,
  Col,
  Statistic,
  Popconfirm,
  Tooltip,
} from 'antd';
import type { ColumnType } from 'antd/es/table';
import { Icons } from '@/components/icons';
import { useMemo, useState } from 'react';
import { CheckCircleOutlined, InfoCircleOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import RepositoryFormModal, { RepositoryFormData } from './components/repository-form-modal';
import { GetPackageRevs, PackageRev, PackageRevisionLifecycle } from '@/services/package-revision';
import { Link } from 'react-router-dom';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

type RepositoryGroup = {
  type: RepositoryContentType;
  title: string;
  repositories: Repository[];
  published: number;
  drafts: number;
}

const PackageManagePage = () => {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [repositoryModalVisible, setRepositoryModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
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
    queryKey: ['GetAllPackageRevs'],
    queryFn: async () => {
      const ret = await GetPackageRevs();
      return ret?.items || [];
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
    setRepositoryModalVisible(true);
  };

  const handleRepositoryFormSubmit = async (values: RepositoryFormData) => {
    try {
      const repositoryContentDetails = RepositoryContentDetails[values.repository_group];
      
      const repositoryData: any = {
        apiVersion: 'config.porch.kpt.dev/v1alpha1',
        kind: 'Repository',
        metadata: {
          annotations: {},
          labels: {},
          name: values.name,
        },
        spec: {
          description: values.description,
          type: values.type,
          deployment: false,
          content: repositoryContentDetails.repositoryContent
        }
      };

      if(values.repository_group === RepositoryContentType.DEPLOYMENT ) {
        repositoryData.spec['deployment'] = true
      }
      if(values.repository_group === RepositoryContentType.TEAM_BLUEPRINT ) {
        repositoryData.metadata['annotations']['nephio.org/staging'] = "true"
      }
      if(values.repository_group === RepositoryContentType.ORGANIZATION_BLUEPRINT ) {
        repositoryData.metadata['labels']['kpt.dev/repository-content'] = "organization-blueprints"
      }
      if(values.repository_group === RepositoryContentType.EXTERNAL_BLUEPRINT ) {
        repositoryData.metadata['labels']['kpt.dev/repository-content'] = "external-blueprints"
      }

      // Add git or oci specific fields based on type
      if (values.type === 'git') {
        repositoryData.spec.git = {
          repo: values.git_repo,
          branch: values.git_branch || 'main',
          directory: values.git_directory || '/',
        };
      } else if (values.type === 'oci') {
        repositoryData.spec.oci = {
          registry: values.oci_registry,
        };
      }
      
      // Add authentication if specified
      if (values.auth_type === 'github_token' && values.secret_name) {
        // Add secretRef to the git configuration
        if (values.type === 'git') {
          repositoryData.spec.git.secretRef = {
            name: values.secret_name
          };
        }
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
      console.error('Form submission failed:', error);
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

  const columns: ColumnType<Repository>[] = [
    {
      title: 'Name',
      key: 'name',
      width: 250,
      render: (_: any, r: Repository) => <Link to={`/package-management/repositories/${r.metadata.name}`}>{r.metadata.name}</Link>,
    },
    {
      title: 'Type',
      dataIndex: ['spec', 'type'],
      key: 'type',
      width: 100,
      render: (type: string) => {
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
      render: (_: any, r: Repository) => {
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
        render: (branch: string | undefined) => {
          if (branch) {
            return <Tag color="orange">{branch}</Tag>;
          } else {
            return <Tag>-</Tag>;
          }
        },
    },
    {
        title: 'Path',
        dataIndex: ['spec', 'git', 'directory'],
        key: 'path',
        width: 250,
        render: (path: string | undefined) => {
          if (path) {
            return <Tag>{path}</Tag>;
          } else {
            return <Tag>-</Tag>;
          }
        },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, r: Repository) => {
        return (
          <Space.Compact>
            <Tooltip title="Edit">
              <Button
                size={'small'}
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleEditRepository(r)}
              />
            </Tooltip>
            <Popconfirm
              placement="topRight"
              title={`Are you sure you want to delete repository '${r.metadata.name}'?`}
              onConfirm={() => handleDeleteRepository(r.metadata.name)}
              okText="Confirm"
              cancelText="Cancel"
            >
              <Button size={'small'} type="link" danger icon={<DeleteOutlined />} />
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
    const packageRevs = packageRevData || [];
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
    const groups: Record<RepositoryContentType, RepositoryGroup> = {
      [RepositoryContentType.DEPLOYMENT]: {
        type: RepositoryContentType.DEPLOYMENT,
        title: RepositoryContentDetails[RepositoryContentType.DEPLOYMENT].title,
        repositories: [],
        published: 0,
        drafts: 0
      },
      [RepositoryContentType.TEAM_BLUEPRINT]: {
        type: RepositoryContentType.TEAM_BLUEPRINT,
        title: RepositoryContentDetails[RepositoryContentType.TEAM_BLUEPRINT].title,
        repositories: [],
        published: 0,
        drafts: 0
      },
      [RepositoryContentType.EXTERNAL_BLUEPRINT]: {
        type: RepositoryContentType.EXTERNAL_BLUEPRINT,
        title: RepositoryContentDetails[RepositoryContentType.EXTERNAL_BLUEPRINT].title,
        repositories: [],
        published: 0,
        drafts: 0
      },
      [RepositoryContentType.ORGANIZATION_BLUEPRINT]: {
        type: RepositoryContentType.ORGANIZATION_BLUEPRINT,
        title: RepositoryContentDetails[RepositoryContentType.ORGANIZATION_BLUEPRINT].title,
        repositories: [],
        published: 0,
        drafts: 0
      },
      [RepositoryContentType.FUNCTION]: {
        type: RepositoryContentType.FUNCTION,
        title: RepositoryContentDetails[RepositoryContentType.FUNCTION].title,
        repositories: [],
        published: 0,
        drafts: 0
      },
    };
    
    // Group repositories based on the specified criteria
    repositories.forEach((repo: Repository) => {
        const group = getRepositoryGroup(repo);
        const repoWithStats = {
          ...repo,
          __stats: repoStats[repo.metadata?.name || ''] || { published: 0, drafts: 0 }
        };
        groups[group].repositories.push(repoWithStats);
        
        const repoPackageRevs = packageRevsByRepo[repo.metadata?.name || ''] || [];
        
        const publishedRevs = repoPackageRevs.filter(rev => rev.metadata.labels?.['kpt.dev/latest-revision'] === 'true' && rev.spec?.lifecycle === PackageRevisionLifecycle.PUBLISHED);
        const draftRevs = repoPackageRevs.filter(rev => rev.spec?.lifecycle === PackageRevisionLifecycle.DRAFT);
        groups[group].published += publishedRevs.length;
        groups[group].drafts += draftRevs.length;
    });
    
    return Object.values(groups).filter((group) => group.type !== RepositoryContentType.FUNCTION);
  }, [repoData, packageRevData]);
  
  // Generate columns for each group table
  const getColumnsForGroup = (groupType: RepositoryContentType) => {
    // Create a copy of the base columns
    const groupColumns = [...columns];
    
    // Add a status column specific to the group type
    groupColumns.splice(5, 0, {
      title: RepositoryContentDetails[groupType].title || 'Packages',
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
        className="mb-4 shadow-lg"
        actions={[<Button type="link" onClick={() => setActiveTab('repository')}>View details</Button>]}
      >
        <div className="min-h-[325px]">
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
                  <Link to={`/package-management/repositories/${repo.metadata?.name}`}>
                    {repo.metadata?.name}
                  </Link>
                </Space>
                <div>
                  <Typography.Link href={repo.spec?.git?.repo || repo.spec?.oci?.registry} target='_blank'>
                    {repo.spec?.git?.repo || repo.spec?.oci?.registry}
                  </Typography.Link>
                </div>
              </List.Item>
            )}
          />
          {group.repositories.length > 5 && (
            <Flex justify='center'>
              <Typography.Text type="secondary">
                {`+ ${group.repositories.length - 5} more`}
              </Typography.Text>
            </Flex>
          )}
        </div>
      </Card>
    );
  };

  return (
    <Spin spinning={isLoading}>
        <Panel showSelectCluster={false} whiteBackground={false}>
        {messageContextHolder}
        
        <Tabs defaultActiveKey="dashboard" activeKey={activeTab} onChange={setActiveTab}>
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

        <RepositoryFormModal
          visible={repositoryModalVisible}
          editingRepository={editingRepository}
          onCancel={() => setRepositoryModalVisible(false)}
          onSubmit={handleRepositoryFormSubmit}
        />
        </Panel>
    </Spin>
  );
};

export default PackageManagePage;
