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

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { getUserSetting, updateUserSetting } from '@/services/user-setting';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

// Local storage key for theme
const THEME_STORAGE_KEY = 'dcn-dashboard-theme';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    // First try to get theme from localStorage
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    return 'light'; // Default theme
  });
  const [loading, setLoading] = useState(true);

  // Initialize theme from user settings and localStorage
  useEffect(() => {
    const initTheme = async () => {
      try {
        // Try to get theme from API (will override localStorage if exists)
        const response = await getUserSetting();
        if (response.data && response.data.theme && (response.data.theme === 'light' || response.data.theme === 'dark')) {
          setTheme(response.data.theme as ThemeMode);
          // Sync localStorage with API setting
          localStorage.setItem(THEME_STORAGE_KEY, response.data.theme);
        }
      } catch (error) {
        console.error('Failed to load theme setting from API:', error);
        // If API fails, we already have theme from localStorage
      } finally {
        setLoading(false);
      }
    };

    initTheme();
  }, []);

  // Update document body class for global styling
  useEffect(() => {
    if (!loading) {
      document.body.dataset.theme = theme;
      if (theme === 'dark') {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    }
  }, [theme, loading]);

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    
    // Save to localStorage first (works offline)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    
    // Then try to sync with API
    try {
      const userSettings = (await getUserSetting()).data || {};
      await updateUserSetting({
        ...userSettings,
        theme: newTheme
      });
    } catch (error) {
      console.error('Failed to update theme setting in API:', error);
      // Theme still saved in localStorage even if API fails
    }
  };

  // Ant Design theme config
  const { defaultAlgorithm, darkAlgorithm } = antdTheme;

  if (loading) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ConfigProvider
        theme={{
          algorithm: theme === 'dark' ? darkAlgorithm : defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
          },
          components: theme === 'dark' ? {
            Table: {
              colorBgContainer: '#1f1f1f',
              colorBorderSecondary: '#303030',
            },
            Card: {
              colorBgContainer: '#1f1f1f',
            },
            Modal: {
              colorBgElevated: '#1f1f1f',
            },
            Drawer: {
              colorBgElevated: '#1f1f1f',
            }
          } : undefined
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
