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

import React from 'react';
import { Button, Tooltip } from 'antd';
import { BulbOutlined, BulbFilled } from '@ant-design/icons';
import { useTheme } from '@/contexts/theme-context';
import { cn } from '@/utils/cn.ts';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <Tooltip title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
      <Button 
        type="text" 
        className={cn('flex items-center justify-center')}
        onClick={toggleTheme}
        icon={theme === 'light' ? <BulbOutlined /> : <BulbFilled />}
      />
    </Tooltip>
  );
};

export default ThemeToggle;
