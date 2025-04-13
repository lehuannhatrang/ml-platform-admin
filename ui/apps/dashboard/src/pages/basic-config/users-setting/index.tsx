import Panel from '@/components/panel';
import { getAllUserSettings, getUserSetting, deleteUserSetting, UserSetting } from '@/services/user-setting';
import { useQuery } from '@tanstack/react-query';
import { FC, useState } from 'react';
import { Spin, Typography, Row, Col, Card, Flex, Popconfirm, message, Tabs, Table, Button, Empty, Tag, Avatar, Space, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, InfoCircleOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import UserSettingsModal from './edit-user-settings-modal';
import type { TabsProps, TableProps } from 'antd';
import { useAuth } from '@/components/auth';
import { USER_ROLE } from '@/services/auth';
import TagList from '@/components/tag-list';

const UserSettings: FC = () => {
    const { role } = useAuth();
    const isAdmin = role === USER_ROLE.ADMIN;

    const [userSettingModal, setUserSettingModal] = useState<{
        mode: 'create' | 'edit';
        open: boolean;
        initialData?: UserSetting;
    }>({
        mode: 'create',
        open: false,
    });

    const { data: currentUserSettings, isLoading: isLoadingCurrentUser, refetch: refetchCurrentUser } = useQuery({
        queryKey: ['get-user-setting'],
        queryFn: async () => {
            const resp = await getUserSetting();
            return resp.data;
        },
    });

    const { data: allUsersSettings, isLoading: isLoadingAllUsers, refetch: refetchAllUsers } = useQuery({
        queryKey: ['get-all-users'],
        queryFn: async () => {
            if (!isAdmin) return { users: [] };
            const resp = await getAllUserSettings();
            return { users: resp.data || [] };
        },
        enabled: isAdmin,
    });

    const refetchData = async () => {
        await refetchCurrentUser();
        if (isAdmin) {
            await refetchAllUsers();
        }
    };

    const getRoleTag = (role?: USER_ROLE) => {
        return <Tag color={role === USER_ROLE.ADMIN ? 'blue' : 'gray'}>{role || '-'}</Tag>;
    };

    const columns: TableProps<UserSetting>['columns'] = [
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
            render: (text) => (
                <Space>
                    <Avatar icon={<UserOutlined />} />
                    <span>{text}</span>
                </Space>
            ),
        },
        {
            title: 'Display Name',
            dataIndex: 'displayName',
            key: 'displayName',
            render: (text) => text || '-',
        },
        {
            title: 'Global Permission',
            key: 'globalPermission',
            dataIndex: ['preferences', 'role'],
            render: (role: USER_ROLE) => getRoleTag(role),
        },
        {
            title: 'Cluster Roles',
            key: 'clusterRoles',
            render: (_, record) => {
                if (record.preferences?.role === USER_ROLE.ADMIN) {
                    return <Typography.Text type="secondary">
                        All clusters
                        <Tooltip title="Adminstrator can access all clusters">
                            <InfoCircleOutlined className="ml-1" />
                        </Tooltip>
                    </Typography.Text>;
                }
                
                if (record.clusterPermissions) {
                    try {
                        return <TagList tags={record.clusterPermissions.map(p => ({ key: p.cluster, value: `${p.cluster}: ${p.roles.join(', ')}` }))} />
                    } catch (e) {
                        // Parsing error, just display none
                    }
                }
                
                return <Typography.Text type="secondary">None</Typography.Text>;
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="middle">
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => setUserSettingModal({
                            mode: 'edit',
                            open: true,
                            initialData: record,
                        })}
                    >
                        Edit
                    </Button>
                    <Popconfirm
                        title="Delete User"
                        description={`Are you sure you want to delete ${record.username}?`}
                        onConfirm={async () => {
                            try {
                                await deleteUserSetting(record.username);
                                message.success('User deleted successfully');
                                refetchData();
                            } catch (error) {
                                message.error('Failed to delete user');
                            }
                        }}
                        okText="Yes"
                        cancelText="No"
                    >
                        <Button type="text" danger icon={<DeleteOutlined />}>
                            Delete
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const tabs: TabsProps['items'] = [
        {
            key: 'mySettings',
            label: (
                <span>
                    My Settings
                </span>
            ),
            children: (
                <Spin spinning={isLoadingCurrentUser}>
                    {currentUserSettings ? (
                        <Card>
                            <Row gutter={[16, 16]}>
                                <Col span={12}>
                                    <Typography.Title level={4}>Profile Settings</Typography.Title>
                                    <Card bordered={false} className="bg-gray-50">
                                        <Row>
                                            <Col span={12}><strong>Username:</strong></Col>
                                            <Col span={12}>{currentUserSettings.username}</Col>
                                        </Row>
                                        <Row className="mt-3">
                                            <Col span={12}><strong>Display Name:</strong></Col>
                                            <Col span={12}>{currentUserSettings.displayName || '-'}</Col>
                                        </Row>
                                        <Row className="mt-3">
                                            <Col span={12}><strong>Role:</strong></Col>
                                            <Col span={12}>{getRoleTag(currentUserSettings.preferences?.role)}</Col>
                                        </Row>
                                        <Row className="mt-3">
                                            <Col span={12}><strong>Theme:</strong></Col>
                                            <Col span={12}>{currentUserSettings.theme || 'Default'}</Col>
                                        </Row>
                                        <Row className="mt-3">
                                            <Col span={12}><strong>Language:</strong></Col>
                                            <Col span={12}>{currentUserSettings.language || 'Default'}</Col>
                                        </Row>
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    <Typography.Title level={4}>Dashboard Settings</Typography.Title>
                                    <Card bordered={false} className="bg-gray-50">
                                        <Row>
                                            <Col span={12}><strong>Default View:</strong></Col>
                                            <Col span={12}>{currentUserSettings.dashboard?.defaultView || 'Default'}</Col>
                                        </Row>
                                        <Row className="mt-3">
                                            <Col span={12}><strong>Refresh Interval:</strong></Col>
                                            <Col span={12}>{currentUserSettings.dashboard?.refreshInterval || '-'} seconds</Col>
                                        </Row>
                                        <Row className="mt-3">
                                            <Col span={12}><strong>Date Format:</strong></Col>
                                            <Col span={12}>{currentUserSettings.dateFormat || 'Default'}</Col>
                                        </Row>
                                        <Row className="mt-3">
                                            <Col span={12}><strong>Time Format:</strong></Col>
                                            <Col span={12}>{currentUserSettings.timeFormat || 'Default'}</Col>
                                        </Row>
                                    </Card>
                                </Col>
                                <Col span={24} className="mt-4">
                                    <Flex justify="center">
                                        <Button
                                            type="primary"
                                            icon={<EditOutlined />}
                                            onClick={() => setUserSettingModal({
                                                mode: 'edit',
                                                open: true,
                                                initialData: currentUserSettings,
                                            })}
                                        >
                                            Edit Settings
                                        </Button>
                                    </Flex>
                                </Col>
                            </Row>
                        </Card>
                    ) : (
                        <Card>
                            <Empty
                                description="No settings configured yet"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            >
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={() => setUserSettingModal({
                                        mode: 'create',
                                        open: true,
                                    })}
                                >
                                    Create Settings
                                </Button>
                            </Empty>
                        </Card>
                    )}
                </Spin>
            ),
        },
    ];

    if (isAdmin) {
        tabs.push({
            key: 'allUsers',
            label: (
                <span>
                    Users Management
                </span>
            ),
            children: (
                <Spin spinning={isLoadingAllUsers}>
                    <Card title="User Management" extra={
                        <Flex gap={8} align="center">
                            <Typography.Text type="secondary">
                                Administrator can create, edit, and delete users
                            </Typography.Text>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => setUserSettingModal({
                                    mode: 'create',
                                    open: true,
                                })}
                            >
                                Create User
                            </Button>
                        </Flex>
                    }>
                        <Table
                            columns={columns}
                            dataSource={allUsersSettings?.users || []}
                            rowKey="username"
                            />
                    </Card>
                </Spin>
            ),
        });
    }

    return (
        <Panel>
            <Tabs defaultActiveKey={isAdmin ? 'allUsers' : 'mySettings'} items={tabs} />
            <UserSettingsModal
                mode={userSettingModal.mode}
                open={userSettingModal.open}
                initialData={userSettingModal.initialData}
                onCancel={() => setUserSettingModal({
                    mode: 'create',
                    open: false,
                })}
                onOk={async () => {
                    message.success(
                        userSettingModal.mode === 'create'
                            ? 'User created successfully'
                            : 'User updated successfully'
                    );
                    await refetchData();
                    setUserSettingModal({
                        mode: 'create',
                        open: false,
                    });
                }}
            />
        </Panel>
    );
};

export default UserSettings;
