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

import React, { useRef } from 'react';
import '@n8n/chat/style.css';
import './chat.css';
import { createChat } from '@n8n/chat';
import { Button, Tooltip } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { GetDashboardConfig } from '@/services/dashboard-config';

interface ChatProviderProps {
  children?: React.ReactNode;
  hideOnPaths?: string[];
}

interface ChatButtonProps {
  hideOnPaths?: string[];
}

// A simple function to initialize the chat
export const initChat = async (webhookUrl: string) => {
  try {
    if (!webhookUrl) {
      console.warn('Chat webhook URL is not configured');
      return;
    }
    
    createChat({
      webhookUrl,
      initialMessages: ['Hi there! I\'m the DCN Dashboard assistant. How can I help you today?'],
      webhookConfig: {
        method: 'POST',
        headers: {}
      },
      chatSessionKey: `dcn-dashboard-chat`,
    });
  } catch (error) {
    console.error('Failed to initialize chat:', error);
  }
};

// Chat button component that shows in the bottom right of the screen
export const ChatButton: React.FC<ChatButtonProps> = ({ hideOnPaths = [] }) => {
  
  const chatInitializedRef = useRef(false);

  const {data: configData} = useQuery({
    queryKey: ['config'],
    queryFn: () => GetDashboardConfig(),
  })

  const webhookUrl = configData?.data?.ai_agent_chat_webhook;
  
  // Check if current path should hide the chat button
  const shouldHideOnCurrentPath = () => {
    const currentPath = window.location.pathname;
    return hideOnPaths.some(path => currentPath.includes(path));
  };
  
  // Initialize chat when button is clicked
  const handleChatButtonClick = async () => {
    if (!chatInitializedRef.current && webhookUrl) {
      await initChat(webhookUrl);
      chatInitializedRef.current = true;
    }
  };
  
  if (shouldHideOnCurrentPath()) {
    return null;
  }

  if (!webhookUrl) {
    return null;
  }
  
  return (
    <div className="chat-button-container">
      <Tooltip title="Open chat assistant">
        <Button 
          type="primary" 
          shape="circle" 
          size='large'
          icon={<MessageOutlined />} 
          onClick={handleChatButtonClick}
          className="chat-float-button"
          aria-label="Open chat assistant"
        />
      </Tooltip>
    </div>
  );
};

// ChatProvider component acts as a wrapper for the chat functionality
const ChatProvider: React.FC<ChatProviderProps> = ({ children, hideOnPaths = [] }) => {
  return (
    <>
      {children}
      <ChatButton hideOnPaths={hideOnPaths} />
    </>
  );
};

export default ChatProvider;
