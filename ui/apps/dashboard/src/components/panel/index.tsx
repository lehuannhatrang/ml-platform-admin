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

import * as React from 'react';

import { FC, ReactNode, useMemo } from 'react';
import { IRouteObjectHandle, getRoutes } from '@/routes/route.tsx';

import { Breadcrumb, Flex, Select, Tooltip } from 'antd';
import { useMatches } from 'react-router-dom';
import useCluster from '@/hooks/use-cluster';
import { KubernetesOutlined } from '@ant-design/icons';
import { getClusterColorByValue } from '@/utils/cluster';
import { useTheme } from '@/contexts/theme-context';
import { cn } from '@/utils/cn.ts';

interface IPanelProps {
  children: ReactNode;
  showSelectCluster?: boolean;
  whiteBackground?: boolean;
}

interface MenuItem {
  key?: React.Key;
  title?: React.ReactNode;
  label?: React.ReactNode;
  path?: string;
  href?: string;
}

const Panel: FC<IPanelProps> = (props) => {
  const { children, showSelectCluster = true, whiteBackground = true } = props;
  const matches = useMatches();
  const { clusterOptions, isClusterDataLoading, selectedCluster, setSelectedCluster } = useCluster({});
  const breadcrumbs = useMemo(() => {
    if (!matches || matches.length === 0) return [] as MenuItem[];
    const filteredMatches = matches.filter((m) => Boolean(m.handle));
    let idx = 0;
    let ptr = getRoutes()[0];
    const menuItems: MenuItem[] = [];
    while (idx < filteredMatches.length) {
      const { isPage, sidebarKey: _sideBarKey } = filteredMatches[idx]
        .handle as IRouteObjectHandle;
      for (let i = 0; ptr.children && i < ptr.children.length; i++) {
        if (ptr.children[i].handle?.sidebarKey === _sideBarKey) {
          menuItems.push({
            title:
              isPage && filteredMatches[idx].pathname ? (
                <a>{ptr.children[i].handle?.sidebarName}</a>
              ) : (
                ptr.children[i].handle?.sidebarName
              ),
          });
          ptr = ptr.children[i];
        }
      }
      idx++;
    }
    return menuItems;
  }, [matches]);
  const handleClusterChange = (value: string) => {
    const selectedOption = clusterOptions.find(opt => opt.value === value);
    if (selectedOption) {
      setSelectedCluster(selectedOption);
    }
  };
  const { theme } = useTheme();
  
  return (
    <div className={cn(
      "w-full h-full px-[30px] py-[20px] box-border",
      theme === 'light' ? "bg-[#FAFBFC]" : "bg-[#141414]"
    )}>
      <Flex justify='space-between' align='center' className='mb-4'>
        <Flex align='center' gap={8}>
          {showSelectCluster ? <>
            <Tooltip title="Select Cluster">
              <KubernetesOutlined style={{ fontSize: 36, color: getClusterColorByValue(selectedCluster.value) }} />
            </Tooltip>
            <Select
              className=""
              size="large"
              loading={isClusterDataLoading}
              value={selectedCluster.value}
              onChange={handleClusterChange}
              options={clusterOptions}
              disabled={clusterOptions.length === 0}
              style={{ width: 250 }}
              optionRender={(option) => {
                const value = typeof option.value === 'string' ? option.value : String(option.value);
                return <Flex gap={8} align='center'>
                  <KubernetesOutlined style={{ fontSize: 36, color: getClusterColorByValue(value) }} />
                  {option.label}
                </Flex>;
              }}
              placeholder="Select cluster"
            />
          </> : <div></div>}
        </Flex>
        <Breadcrumb className="mb-4" items={breadcrumbs} />
      </Flex>
      <div className={cn(
        "w-full h-full box-border p-[12px] overflow-x-hidden overflow-y-auto",
        whiteBackground ? (theme === 'light' ? 'bg-white' : 'bg-[#1f1f1f]') : ''
      )} style={{ maxHeight: 'calc(100vh - 120px)' }}>
        {children}
      </div>
    </div>
  );
};

export default Panel;
