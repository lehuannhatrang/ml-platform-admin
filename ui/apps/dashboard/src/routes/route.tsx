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
import React, { ReactNode } from 'react';
import { NonIndexRouteObject, redirect } from 'react-router-dom';
import type { MenuProps } from 'antd';
import _ from 'lodash';
import { MainLayout } from '@/layout';
import ErrorBoundary from '@/components/error';
import Overview from '@/pages/overview';
import Login from '@/pages/login';
import { Icons } from '@/components/icons';
import InitTokenPage from '@/pages/login/init-token';
import CallbackPage from '@/pages/callback';
import SignOutPage from '@/pages/sign-out';
import UsersManagement from '@/pages/users';
import MonitoringConfig from '@/pages/basic-config/monitoring-config';
import ClusterManage from '@/pages/cluster-manage';
import CloudCredentials from '@/pages/cloud-credentials';

export interface IRouteObjectHandle {
  icon?: ReactNode;
  sidebarKey: string;
  sidebarName: string;
  isPage?: boolean;
}

export interface RouteObject extends NonIndexRouteObject {
  handle?: IRouteObjectHandle;
  children?: RouteObject[];
}

export interface FlattenRouteObject extends IRouteObjectHandle {
  url: string;
}

const redirectToHomepage = () => {
  return redirect('/overview');
};
const IconStyles = {
  width: 20,
  height: 20,
};

export function getRoutes() {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <MainLayout />,
      errorElement: <ErrorBoundary />,
      children: [
        {
          path: '/',
          loader: redirectToHomepage,
        },
        {
          path: '/overview',
          element: <Overview />,
          handle: {
            sidebarKey: 'OVERVIEW',
            sidebarName: i18nInstance.t('86385379cf9cfbc2c554944f1c054a45'),
            icon: <Icons.overview {...IconStyles} />,
          },
        },
        {
          path: '/users',
          element: <UsersManagement />,
          handle: {
            sidebarKey: 'USERS',
            sidebarName: 'Users Management',
            icon: <Icons.user {...IconStyles} />,
          },
        },
        {
          path: '/infra-manage',
          handle: {
            sidebarKey: 'INFRA-MANAGE',
            sidebarName: 'Infra Manage',
            icon: <Icons.clusters {...IconStyles} />,
          },
          children: [
            {
              path: 'clusters',
              element:<ClusterManage />,
              handle: {
                sidebarKey: 'CLUSTER-MANAGE',
                sidebarName: 'Cluster Manage',
              },
            },
            {
              path: 'cloud-credentials',
              element: <CloudCredentials />,
              handle: {
                sidebarKey: 'CLOUD-CREDENTIALS',
                sidebarName: 'Cloud Credentials',
              },
            }
          ]
        },
        {
          path: '/basic-config',
          handle: {
            sidebarKey: 'BASIC-CONFIG',
            sidebarName: i18nInstance.t('cba0d61936703636d3ab45914c9e754a'),
            icon: <Icons.basicConfig {...IconStyles} />,
            isPage: false,
          },
          children: [
            {
              path: 'monitoring-config',
              element: <MonitoringConfig />,
              handle: {
                sidebarKey: 'MONITORING-CONFIG',
                sidebarName: 'Monitoring Config',
              },
            }
          ],
        },
      ],
    },
    {
      path: '/login',
      errorElement: <ErrorBoundary />,
      element: <Login />,
    },
    {
      path: '/init-token',
      errorElement: <ErrorBoundary />,
      element: <InitTokenPage />,
    },
    {
      path: '/callback',
      errorElement: <ErrorBoundary />,
      element: <CallbackPage />,
    },
    {
      path: '/sign-out',
      errorElement: <ErrorBoundary />,
      element: <SignOutPage />,
    },
  ];

  return routes;
}
export const routes: RouteObject[] = getRoutes();

export const flattenRoutes: Record<string, string> = {};

function concatPathSegment(paths: string[] = []) {
  return paths.map((p) => (p.startsWith('/') ? p : `/${p}`)).join('');
}

export function traverseRoutes(route: RouteObject, paths: string[] = []) {
  if (_.isUndefined(route) || _.isUndefined(route.handle)) return;
  const { path = '' } = route;
  const { sidebarKey } = route.handle;
  const newPaths = [...paths, path];
  if (!route.children) {
    flattenRoutes[sidebarKey] = concatPathSegment(newPaths);
  } else {
    route.children.forEach((child) => traverseRoutes(child, newPaths));
  }
}

export function filterMenuItems(
  menuItems: MenuItem[],
  menuInfo: Record<string, boolean>,
): MenuItem[] {
  return menuItems
    .filter((menuItem) => {
      if (!menuItem) return;
      const menuKey = menuItem.key as string;
      if (menuKey && !menuInfo[menuKey]) {
        return;
      }
      if (menuItem.children && menuItem.children.length > 0) {
        menuItem.children = filterMenuItems(menuItem.children, menuInfo);
      }
      return menuItem;
    })
    .filter(Boolean);
}

// type MenuPropsItems = MenuProps['items']
type MenuItem = Required<MenuProps>['items'][number] & {
  children?: MenuItem[];
};

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: (MenuItem | null)[],
  type?: 'group',
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
    type,
  } as MenuItem;
}

function convertRouteToMenuItem(
  route: RouteObject,
  keyPaths: string[] = [],
): MenuItem | null {
  if (_.isUndefined(route.handle)) return null;
  const { sidebarName, sidebarKey, icon } = route.handle;
  const newKeyPaths = [...keyPaths, sidebarKey];
  if (!route.children) {
    return getItem(sidebarName, sidebarKey, icon);
  } else {
    return getItem(
      sidebarName,
      sidebarKey,
      icon,
      route.children
        .map((child) => convertRouteToMenuItem(child, newKeyPaths))
        .filter((menuItem) => !_.isNull(menuItem)),
    );
  }
}

let menuItems: MenuItem[] = [];

export function initRoute() {
  const rs = getRoutes();
  if (!rs[0].children) return;

  menuItems = rs[0].children
    .map((route) => convertRouteToMenuItem(route) as MenuItem)
    .filter((menuItem) => !_.isNull(menuItem));

  rs[0].children.map((route) => traverseRoutes(route));
}

initRoute();

export { menuItems };
