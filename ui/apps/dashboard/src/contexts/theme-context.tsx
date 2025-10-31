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
const THEME_STORAGE_KEY = 'ml-platform-admin-theme';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    // Get theme from localStorage
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    return 'light'; // Default theme
  });

  // Update document body class for global styling
  useEffect(() => {
    document.body.dataset.theme = theme;
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    
    // Save to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  };

  // Ant Design theme config
  const { defaultAlgorithm, darkAlgorithm } = antdTheme;



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
