import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Typography, Divider, Transfer, Space } from 'antd';
import i18nInstance from '@/utils/i18n';
import { IResponse } from '@/services/base';
import { UserSetting, createUserSetting, updateUserSetting } from '@/services/user-setting';
import { useCluster } from '@/hooks';
import { ClusterOption } from '@/hooks/use-cluster';

interface UserSettingsModalProps {
  mode: 'create' | 'edit';
  open: boolean;
  initialData?: UserSetting;
  onCancel: () => Promise<void> | void;
  onOk: (ret: IResponse<any>) => Promise<void>;
}

const roleOptions = [
  { label: 'Administrator', value: 'Admin' },
  { label: 'Basic User', value: 'Basic_User' },
];

interface ClusterItem {
  key: string;
  title: string;
  description: string;
}

const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  mode,
  open,
  initialData,
  onCancel,
  onOk,
}) => {
  const [form] = Form.useForm<UserSetting>();
  const [targetKeys, setTargetKeys] = useState<React.Key[]>([]);
  const [showClusterPermissions, setShowClusterPermissions] = useState<boolean>(false);

  const { clusterOptions } = useCluster({allowSelectAll: false});

  useEffect(() => {
    if (initialData) {
      form.setFieldsValue(initialData);
      setShowClusterPermissions(initialData.preferences?.role === 'Basic User');
      // Initialize selected clusters if available
      if (initialData.preferences?.clusterPermissions) {
        try {
          const clusterPerms = typeof initialData.preferences.clusterPermissions === 'string' 
            ? JSON.parse(initialData.preferences.clusterPermissions) 
            : initialData.preferences.clusterPermissions;
          setTargetKeys(Array.isArray(clusterPerms) ? clusterPerms : []);
        } catch (e) {
          setTargetKeys([]);
        }
      }
    } else {
      form.resetFields();
      setTargetKeys([]);
      // Set default role for new users
      form.setFieldsValue({
        preferences: {
          role: 'Basic User'
        }
      });
      setShowClusterPermissions(true);
    }
  }, [initialData, form]);

  const handleRoleChange = (value: string) => {
    setShowClusterPermissions(value === 'Basic User');
  };

  const handleTransferChange = (nextTargetKeys: React.Key[]) => {
    setTargetKeys(nextTargetKeys);
  };

  // Prepare cluster data for transfer component
  const clusterItems: ClusterItem[] = clusterOptions.map((cluster: ClusterOption) => ({
    key: cluster.value,
    title: cluster.label,
    description: cluster.label
  }));

  return (
    <Modal
      title={
        mode === 'create'
          ? 'Create User'
          : 'Edit User'
      }
      open={open}
      width={800}
      okText={i18nInstance.t('38cf16f2204ffab8a6e0187070558721', 'Save')}
      cancelText={i18nInstance.t('625fb26b4b3340f7872b411f401e754c', 'Cancel')}
      destroyOnClose={true}
      onOk={async () => {
        const submitData = await form.validateFields();
        
        // Add cluster permissions to form data if applicable
        if (showClusterPermissions && targetKeys.length > 0) {
          if (!submitData.preferences) {
            submitData.preferences = {};
          }
          submitData.preferences.clusterPermissions = JSON.stringify(targetKeys);
        }
        
        const ret = mode === 'create'
          ? await createUserSetting(submitData)
          : await updateUserSetting(submitData);
        await onOk(ret);
      }}
      onCancel={async () => {
        await onCancel();
      }}
    >
      <Form
        form={form}
        layout="vertical"
        validateMessages={{
          required: i18nInstance.t(
            'e0a23c19b8a0044c5defd167b441d643',
            "'${name}' is required",
          ),
        }}
      >
        <Typography.Title level={5}>User Information</Typography.Title>
        
        {mode === 'create' && (
          <Form.Item
            name="username"
            label="Username"
            rules={[{ required: true }]}
          >
            <Input placeholder="Enter username" />
          </Form.Item>
        )}

        <Form.Item
          name="displayName"
          label="Display Name"
        >
          <Input placeholder="Enter display name" />
        </Form.Item>

        {mode === 'create' && (
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Please input a password' }]}
          >
            <Input.Password placeholder="Enter password" />
          </Form.Item>
        )}

        <Form.Item
          name={['preferences', 'role']}
          label="Role"
          rules={[{ required: true, message: 'Please select a role' }]}
        >
          <Select
            options={roleOptions}
            placeholder="Select user role"
            onChange={handleRoleChange}
          />
        </Form.Item>

        {showClusterPermissions && (
          <>
            <Divider />
            <Typography.Title level={5}>Cluster Permissions</Typography.Title>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
              For Basic Users, select clusters they should have access to:
            </Typography.Text>
            
            <Transfer
              dataSource={clusterItems}
              titles={['Available Clusters', 'Granted Access']}
              targetKeys={targetKeys}
              onChange={handleTransferChange}
              render={item => (
                <Space>
                  <span>{item.title}</span>
                  <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                    ({item.description})
                  </Typography.Text>
                </Space>
              )}
              listStyle={{ width: 350, height: 300 }}
            />
          </>
        )}
      </Form>
    </Modal>
  );
};

export default UserSettingsModal;
