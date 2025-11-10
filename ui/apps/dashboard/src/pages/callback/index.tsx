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

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, message } from 'antd';
import { useKeycloak } from '@/contexts/keycloak-context';
import { useAuth } from '@/components/auth';

const CallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { keycloak, authenticated } = useKeycloak();
  const { setToken } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    const handleCallback = async () => {
      // Check if this is an implicit flow callback (token in URL fragment)
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const state = params.get('state');

      if (accessToken) {
        // Implicit flow callback
        console.log('Processing implicit flow callback');
        
        // Verify state
        const storedState = sessionStorage.getItem('keycloak-state');
        if (state && storedState && state !== storedState) {
          console.error('State mismatch');
          messageApi.error('Authentication failed: state mismatch');
          navigate('/login');
          return;
        }
        
        // Clear stored state
        sessionStorage.removeItem('keycloak-state');
        sessionStorage.removeItem('keycloak-nonce');
        
        // Set the token - this will trigger authentication in the AuthProvider
        setToken(accessToken);
        
        // Small delay to ensure token is set, then redirect
        setTimeout(() => {
          navigate('/overview', { replace: true });
        }, 100);
        return;
      }

      // For standard flow, wait for keycloak to be initialized
      // Only process if keycloak has finished initialization
      if (keycloak !== null) {
        if (authenticated && keycloak.token) {
          // Successfully authenticated, redirect to overview
          setToken(keycloak.token);
          navigate('/overview', { replace: true });
        } else if (!keycloak.authenticated) {
          // Authentication failed or not authenticated yet
          // Give it a moment, then redirect to login if still not authenticated
          setTimeout(() => {
            if (!authenticated) {
              navigate('/login', { replace: true });
            }
          }, 2000);
        }
      }
    };

    handleCallback();
  }, [authenticated, keycloak, navigate, setToken, messageApi]);

  return (
    <>
      {contextHolder}
      <div className="h-screen w-screen flex justify-center items-center">
        <div className="text-center">
          <Spin size="large" />
          <div className="mt-4">Processing authentication...</div>
        </div>
      </div>
    </>
  );
};

export default CallbackPage;

