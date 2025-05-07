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
import { Modal, Button, Table, Input, Tag, Select, Space, message, Spin } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { GetClusterUsers, UpdateClusterUsers, ClusterUser } from '../../services/cluster';

interface ClusterUsersModalProps {
  clusterName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const roleOptions = [
  { label: 'Owner', value: 'owner' },
  { label: 'Member', value: 'member' },
];

const ClusterUsersModal: React.FC<ClusterUsersModalProps> = ({ 
  clusterName, 
  open, 
  onClose,
  onSuccess
}) => {
  const [users, setUsers] = useState<ClusterUser[]>([]);
  const [originalUsers, setOriginalUsers] = useState<ClusterUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [savingChanges, setSavingChanges] = useState(false);
  const [messageApi] = message.useMessage();
  
  // State for adding new user
  const [newUser, setNewUser] = useState<{username: string; roles: string[]}>({
    username: '',
    roles: ['member'],
  });
  const [addingUser, setAddingUser] = useState(false);

  // Function to fetch cluster users
  const fetchClusterUsers = async () => {
    setLoading(true);
    try {
      const response = await GetClusterUsers(clusterName);
      if (response && response.code === 200) {
        setUsers(response.data.users || []);
        setOriginalUsers(response.data.users || []);
        
        // Check if there were any errors
        if (response.data.errors && response.data.errors.length > 0) {
          messageApi.warning('Some users may not be available due to permission issues');
        }
      } else {
        messageApi.error('Failed to load cluster users');
      }
    } catch (error) {
      messageApi.error('Failed to load cluster users');
      console.error('Error fetching cluster users:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load users when modal opens
  useEffect(() => {
    if (open) {
      fetchClusterUsers();
    }
  }, [open, clusterName]);

  // Filter users based on search text
  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchText.toLowerCase()) ||
    (user.displayName && user.displayName.toLowerCase().includes(searchText.toLowerCase())) ||
    (user.email && user.email.toLowerCase().includes(searchText.toLowerCase()))
  );

  // Add a new user to the list (temporarily)
  const handleAddUser = () => {
    if (!newUser.username) {
      messageApi.error('Username is required');
      return;
    }
    
    // Check if user already exists
    if (users.some(user => user.username === newUser.username)) {
      messageApi.error('User already exists');
      return;
    }
    
    // Add the new user to the list
    setUsers([
      ...users,
      {
        username: newUser.username,
        displayName: newUser.username, // Use username as display name initially
        roles: newUser.roles,
      }
    ]);
    
    // Reset new user form
    setNewUser({
      username: '',
      roles: ['member'],
    });
    setAddingUser(false);
  };

  // Update a user's roles
  const handleUpdateRoles = (username: string, roles: string[]) => {
    setUsers(users.map(user => 
      user.username === username ? { ...user, roles } : user
    ));
  };

  // Remove a user from the list
  const handleRemoveUser = (username: string) => {
    // Check if user is a dashboard admin
    const user = users.find(u => u.username === username);
    if (user && user.roles.includes('admin')) {
      messageApi.error('Cannot remove dashboard admin users');
      return;
    }
    
    setUsers(users.filter(user => user.username !== username));
  };

  // Save changes to the server
  const handleSaveChanges = async () => {
    setSavingChanges(true);
    try {
      const userUpdates = users.map(user => ({
        username: user.username,
        roles: user.roles,
      }));
      
      const response = await UpdateClusterUsers(clusterName, userUpdates);
      
      if (response && response.code === 200) {
        messageApi.success('User permissions updated successfully');
        setOriginalUsers(response.data.users || []);
        onSuccess();
        onClose();
      } else {
        messageApi.error('Failed to update user permissions');
      }
    } catch (error) {
      messageApi.error('Failed to update user permissions');
      console.error('Error updating user permissions:', error);
    } finally {
      setSavingChanges(false);
    }
  };

  // Check if there are changes to save
  const hasChanges = () => {
    // Different number of users
    if (users.length !== originalUsers.length) return true;
    
    // Check for differences in users or their roles
    for (const user of users) {
      const originalUser = originalUsers.find(u => u.username === user.username);
      if (!originalUser) return true; // New user
      
      // Different number of roles
      if (user.roles.length !== originalUser.roles.length) return true;
      
      // Different roles
      for (const role of user.roles) {
        if (!originalUser.roles.includes(role)) return true;
      }
    }
    
    // Check for removed users
    for (const originalUser of originalUsers) {
      if (!users.find(u => u.username === originalUser.username)) {
        return true;
      }
    }
    
    return false;
  };

  // Table columns definition
  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: 'Display Name',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (text: string) => text || '-',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (text: string) => text || '-',
    },
    {
      title: 'Roles',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: string[], record: ClusterUser) => {
        // Check if user is a dashboard admin
        const isAdmin = roles.includes('admin');
        
        if (isAdmin) {
          return <Tag color="gold">Dashboard Admin</Tag>;
        }
        
        return (
          <Select
            mode="multiple"
            value={roles}
            options={roleOptions}
            style={{ width: '100%' }}
            onChange={(newRoles) => handleUpdateRoles(record.username, newRoles)}
            disabled={isAdmin} // Disable if user is admin
          />
        );
      },
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: ClusterUser) => {
        // Check if user is a dashboard admin
        const isAdmin = record.roles.includes('admin');
        
        return (
          <Button 
            type="link" 
            danger 
            icon={<DeleteOutlined />}
            disabled={isAdmin} // Disable if user is admin
            onClick={() => handleRemoveUser(record.username)}
          >
            Remove
          </Button>
        );
      },
    },
  ];

  return (
    <Modal
      title={`Manage Users for Cluster: ${clusterName}`}
      open={open}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="save"
          type="primary"
          disabled={!hasChanges()}
          loading={savingChanges}
          onClick={handleSaveChanges}
        >
          Save Changes
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Input.Search
            placeholder="Search by username, display name, or email"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
          />
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => setAddingUser(true)}
          >
            Add User
          </Button>
        </div>
        
        {addingUser && (
          <div style={{ 
            padding: 16, 
            backgroundColor: '#f5f5f5', 
            borderRadius: 4,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <Input
              placeholder="Username"
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              style={{ width: 200 }}
            />
            <Select
              mode="multiple"
              value={newUser.roles}
              options={roleOptions}
              style={{ width: 200 }}
              onChange={(roles) => setNewUser({ ...newUser, roles })}
              placeholder="Select roles"
            />
            <Button type="primary" onClick={handleAddUser}>Add</Button>
            <Button onClick={() => setAddingUser(false)}>Cancel</Button>
          </div>
        )}
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin size="large" />
            <div style={{ marginTop: 8 }}>Loading users...</div>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredUsers}
            rowKey="username"
            pagination={false}
            locale={{ emptyText: 'No users found' }}
          />
        )}
      </Space>
    </Modal>
  );
};

export default ClusterUsersModal;
