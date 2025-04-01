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

import i18nInstance from '@/utils/i18n';
import { Alert, Button, Card, Input, message } from 'antd';
import styles from './index.module.less';
import { cn } from '@/utils/cn.ts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InitToken } from '@/services/auth';

const InitTokenPage = () => {
  const [messageApi] = message.useMessage();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleInitToken = async () => {
    if (!token) {
      await messageApi.error(
        i18nInstance.t(
          'token-required',
          'Please enter a valid service account token',
        ),
      );
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await InitToken(token);
      
      if (response.code === 200) {
        await messageApi.success(
          i18nInstance.t(
            'token-initialized',
            'Service account token initialized successfully',
          ),
        );
        setTimeout(() => {
          navigate('/overview');
        }, 1500);
      } else {
        await messageApi.error(
          i18nInstance.t(
            'token-init-failed',
            'Failed to initialize token: ' + (response.message || 'Unknown error'),
          ),
        );
      }
    } catch (error) {
      console.error('Error initializing token:', error);
      await messageApi.error(
        i18nInstance.t(
          'token-init-error',
          'Error initializing token. Please check your token and try again.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className={'h-screen w-screen  bg-[#FAFBFC]'}>
      <div className="h-full w-full flex justify-center items-center ">
        <Card
          className={cn('w-1/2', styles['login-card'])}
          title={
            <div
              className={
                'bg-blue-500 text-white h-[56px] flex items-center px-[16px] text-xl rounded-t-[8px]'
              }
            >
              DCN Dashboard
            </div>
          }
        >

<Alert
            type="info"
            showIcon
            className="mb-4"
            message={i18nInstance.t(
              'token-instructions',
              'Please provide a valid Karmada API server service account token. This token will be used for API server authentication.',
            )}
          />
          
          <div className="my-4">
            <div className="mb-2">Service Account Token:</div>
            <Input.TextArea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your service account token here"
              rows={6}
            />
          </div>
          
          <div className="flex justify-between mt-6">
            <Button onClick={() => navigate('/login')}>
              Back to Login
            </Button>
            <Button 
              type="primary" 
              onClick={handleInitToken}
              loading={loading}
            >
              Initialize Token
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default InitTokenPage;
