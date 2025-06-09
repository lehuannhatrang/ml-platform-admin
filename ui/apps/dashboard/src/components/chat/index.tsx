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
import { Button, Dropdown, MenuProps } from 'antd';
import { MessageOutlined, ExpandOutlined, CommentOutlined } from '@ant-design/icons';
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
export const initChat = async (webhookUrl: string, mode: 'window' | 'fullscreen' = 'window', target: string = '#n8n-chat'): Promise<ReturnType<typeof createChat> | null> => {
  try {
    if (!webhookUrl) {
      console.warn('Chat webhook URL is not configured');
      return null;
    }
    
    const chat = createChat({
      webhookUrl,
      initialMessages: ['Hi there! I\'m the DCN Dashboard assistant. How can I help you today?'],
      webhookConfig: {
        method: 'POST',
        headers: {}
      },
      chatSessionKey: `dcn-dashboard-chat`,
      mode: mode === 'fullscreen' ? 'fullscreen' : 'window',
      target: target
    });
    return chat;
  } catch (error) {
    console.error('Failed to initialize chat:', error);
    return null;
  }
};

// Chat button component that shows in the bottom right of the screen
export const ChatButton: React.FC<ChatButtonProps> = ({ hideOnPaths = [] }) => {
  
  const chatInitializedRef = useRef<ReturnType<typeof createChat> | null>(null);
  const [chatVisible, setChatVisible] = React.useState(false);

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
  
  // Initialize chat in current window
  const handleChatInCurrentWindow = async () => {
    if (!chatInitializedRef.current && webhookUrl) {
      setChatVisible(true);
      const chat = await initChat(webhookUrl, 'window', '#n8n-chat');
      chatInitializedRef.current = chat;
    }
  };

  // Open chat in fullscreen mode in new tab
  const handleChatFullscreen = () => {
    window.open('/chat', '_blank');
  };

  // Menu items for the dropdown
  const menuItems: MenuProps['items'] = [
    {
      key: 'current-window',
      label: 'Current window',
      icon: <CommentOutlined />,
      onClick: handleChatInCurrentWindow,
    },
    {
      key: 'fullscreen',
      label: 'Fullscreen',
      icon: <ExpandOutlined />,
      onClick: handleChatFullscreen,
    },
  ];
  
  if (shouldHideOnCurrentPath()) {
    return null;
  }

  if (!webhookUrl) {
    return null;
  }
  
  return (
    <>
      <div className="chat-button-container">
        <Dropdown 
          menu={{ items: menuItems }} 
          trigger={['click']}
          placement="topRight"
        >
          <Button 
            type="primary" 
            shape="circle" 
            size='large'
            icon={<MessageOutlined />} 
            className="chat-float-button"
            aria-label="Open chat assistant"
          />
        </Dropdown>
      </div>
      {chatVisible && (
        <div id="n8n-chat" style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1000}}/>
      )}
    </>
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
