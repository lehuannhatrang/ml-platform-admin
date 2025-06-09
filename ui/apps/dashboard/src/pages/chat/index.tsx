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

import React, { useEffect, useRef } from 'react';
import '@n8n/chat/style.css';
import { createChat } from '@n8n/chat';
import { useQuery } from '@tanstack/react-query';
import { GetDashboardConfig } from '@/services/dashboard-config';
import { Spin } from 'antd';

const ChatPage: React.FC = () => {
  const chatInitializedRef = useRef(false);

  const {data: configData, isLoading} = useQuery({
    queryKey: ['config'],
    queryFn: () => GetDashboardConfig(),
  });

  const webhookUrl = configData?.data?.ai_agent_chat_webhook;

  useEffect(() => {
    const initFullscreenChat = async () => {
      if (!chatInitializedRef.current && webhookUrl) {
        try {
          createChat({
            webhookUrl,
            initialMessages: ['Hi there! I\'m the DCN Dashboard assistant. How can I help you today?'],
            webhookConfig: {
              method: 'POST',
              headers: {}
            },
            chatSessionKey: `dcn-dashboard-chat`,
            mode: 'fullscreen',
            target: '#fullscreen-chat'
          });
          chatInitializedRef.current = true;
        } catch (error) {
          console.error('Failed to initialize fullscreen chat:', error);
        }
      }
    };

    if (webhookUrl) {
      initFullscreenChat();
    }
  }, [webhookUrl]);

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        width: '100vw'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!webhookUrl) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        width: '100vw',
        flexDirection: 'column'
      }}>
        <h2>Chat not available</h2>
        <p>Chat webhook URL is not configured</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <div id="fullscreen-chat" style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default ChatPage; 