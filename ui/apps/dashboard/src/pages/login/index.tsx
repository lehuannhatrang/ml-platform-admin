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
import { useState, useEffect } from 'react';
import i18nInstance from '@/utils/i18n';
import { Button, Card, Input, Form, message } from 'antd';
import styles from './index.module.less';
import { cn } from '@/utils/cn.ts';
import { Login } from '@/services/auth.ts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth';
import { useTheme } from '@/contexts/theme-context';
import { useKeycloak } from '@/contexts/keycloak-context';
import { loginWithKeycloak } from '@/services/keycloak';

const LoginPage = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const [loginForm] = Form.useForm();
  const { theme } = useTheme();
  const { config: keycloakConfig, keycloak } = useKeycloak();
  const [loginMethod, setLoginMethod] = useState<'keycloak' | 'traditional'>('keycloak');

  // Auto-detect login method based on Keycloak availability
  useEffect(() => {
    if (keycloakConfig?.enabled) {
      setLoginMethod('keycloak');
    } else {
      setLoginMethod('traditional');
    }
  }, [keycloakConfig]);

  const handleKeycloakLogin = async () => {
    try {
      await loginWithKeycloak();
    } catch (error) {
      console.error('Keycloak login failed:', error);
      await messageApi.error(
        i18nInstance.t(
          'b6076a055fe6cc0473e0d313dc58a049',
          '登录失败',
        ),
      );
    }
  };

  const handleLogin = async (values: { username: string; password: string }) => {
    try {
      const ret = await Login(values.username, values.password);
      if (ret.code === 200) {
        await messageApi.success(
          i18nInstance.t(
            '11427a1edb98cf7efe26ca229d6f2626',
            '登录成功，即将跳转',
          ),
          1
        );
        setToken(ret.data.token);
        navigate('/overview');
      } else {
        if (ret.message === "MSG_LOGIN_UNAUTHORIZED_ERROR") {
          navigate('/init-token');
        } else {
          await messageApi.error(
            i18nInstance.t(
              'a831066e2d289e126ff7cbf483c3bad1',
              '登录失败，请重试',
            ),
          );
        }
      }
    } catch (e) {
      console.log('error', e);
      await messageApi.error(
        i18nInstance.t(
          'b6076a055fe6cc0473e0d313dc58a049',
          '登录失败',
        ),
      );
    }
  };

  const isDarkTheme = theme === 'dark';

  return (
    <div className={`h-screen w-screen ${isDarkTheme ? 'bg-[#141414]' : 'bg-[#FAFBFC]'}`}>
      <div className="h-full w-full flex justify-center items-center ">
        <Card
          className={cn('w-1/4', styles['login-card'])}
          title={
            <div
              className={
                'bg-blue-500 text-white h-[56px] flex items-center px-[16px] text-xl rounded-t-[8px]'
              }
            >
              Admin Portal
            </div>
          }
        >
          {keycloakConfig?.enabled && loginMethod === 'keycloak' ? (
            <div className="mt-4 space-y-4">
              <Button 
                type="primary" 
                size="large"
                className="w-full"
                onClick={handleKeycloakLogin}
              >
                {i18nInstance.t('login_with_keycloak', 'Login with Keycloak')}
              </Button>
              
              {/* Optional: Show traditional login option */}
              <div className="text-center">
                <Button 
                  type="link" 
                  onClick={() => setLoginMethod('traditional')}
                >
                  {i18nInstance.t('use_traditional_login', 'Use Username/Password')}
                </Button>
              </div>
            </div>
          ) : (
            <Form
              form={loginForm}
              layout="vertical"
              onFinish={handleLogin}
              className="mt-4"
            >
              <Form.Item
                name="username"
                label="Username"
                rules={[
                  {
                    required: true,
                    message: 'Please enter username'
                  }
                ]}
              >
                <Input placeholder="Enter username" />
              </Form.Item>
              <Form.Item
                name="password"
                label="Password"
                rules={[
                  {
                    required: true,
                    message: 'Please enter password'
                  }
                ]}
              >
                <Input.Password placeholder="Enter password" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" className="w-full">
                  Login
                </Button>
              </Form.Item>
              
              {/* Optional: Show Keycloak login option */}
              {keycloakConfig?.enabled && (
                <div className="text-center">
                  <Button 
                    type="link" 
                    onClick={() => setLoginMethod('keycloak')}
                  >
                    {i18nInstance.t('use_keycloak_login', 'Use Keycloak Login')}
                  </Button>
                </div>
              )}
            </Form>
          )}
        </Card>
      </div>
      {contextHolder}
    </div>
  );
};

export default LoginPage;
