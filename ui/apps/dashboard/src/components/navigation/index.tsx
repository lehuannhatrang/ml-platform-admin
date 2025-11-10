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

import { FC, CSSProperties, useMemo } from 'react';
import styles from './index.module.less';
import DCNLogo from '@/assets/dcn_logo_removebg.png';
import { Button, Popconfirm } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import ThemeToggle from '@/components/theme-toggle';
import { useTheme } from '@/contexts/theme-context';
import { cn } from '@/utils/cn.ts';

export interface IUserInfo {
  id: number;
  username: string;
  avatar: string;
}

interface INavigationProps {
  headerStyle?: CSSProperties;
  usePlaceholder?: boolean;
  brandText?: string;
  userInfo?: IUserInfo;
}

const Navigation: FC<INavigationProps> = (props) => {
  const {
    headerStyle = {},
    usePlaceholder = true,
    brandText = 'Admin Portal',
    userInfo,
  } = props;
  
  const { theme } = useTheme();
  
  const themedHeaderStyle = useMemo(() => ({
    ...headerStyle,
    // Dark mode styling applied directly
    background: theme === 'dark' ? 'rgba(42, 42, 46, 0.94)' : undefined,
    boxShadow: theme === 'dark' ? '0 2px 4px rgba(0, 0, 0, 0.3)' : undefined,
    color: theme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : undefined,
    backdropFilter: 'blur(20px)'
  }), [headerStyle, theme]);
  
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };


  // Style for text in dark mode
  const textStyle = theme === 'dark' ? { color: 'rgba(255, 255, 255, 0.85)' } : {};
  
  return (
    <>
      <div className={cn(styles.navbar)}>
        <div className={cn(styles.header)} style={themedHeaderStyle}>
          <div className={styles.left}>
            <div className={styles.brand}>
              <div className={styles.logoWrap}>
                <img 
                  className={styles.logo} 
                  src={DCNLogo} 
                  style={theme === 'dark' ? { filter: 'brightness(1.2)' } : {}} 
                />
              </div>
              <div className={styles.text} style={textStyle}>{brandText}</div>
            </div>
          </div>
          <div className={styles.center}>
            
          </div>
          <div className={styles.right}>
            {/* extra components */}
            <div className={styles.extra}>
            </div>
            {/* user info */}
            {userInfo && (
              <div className={styles.userWrap}>
                <div className={styles.user}>
                  <img 
                    src={userInfo?.avatar} 
                    className={styles.avatar} 
                    style={theme === 'dark' ? { border: '1px solid rgba(255, 255, 255, 0.2)' } : {}}
                  />
                </div>
              </div>
            )}
            {/* theme toggle button */}
            <div className="ml-2">
              <ThemeToggle />
            </div>
            {/* logout button */}
            <div className="ml-2">
              <Popconfirm 
                title="Are you sure to logout?" 
                onConfirm={handleLogout}
              >
                <Button 
                  type="text" 
                  icon={<LogoutOutlined style={theme === 'dark' ? { color: 'rgba(255, 255, 255, 0.85)' } : {}} />} 
                />
              </Popconfirm>
            </div>
          </div>
        </div>
        {usePlaceholder && <div className={styles.placeholder} />}
      </div>
    </>
  );
};
export default Navigation;
