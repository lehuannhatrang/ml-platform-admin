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
import MultiCloudNamespace from '@/pages/namespace';
import {
  MultiCloudConfig,
  MultiCloudService,
  MultiCloudworkload,
} from '@/pages/multicloud-resource-manage';
import {
  MultiCloudOverridePolicy,
  MultiCloudPropagationPolicy,
} from '@/pages/multicloud-policy-manage';
import {
  Helm,
  KarmadaConfig,
  Oem,
  Registry,
  Upgrade,
} from '@/pages/basic-config';
import { Failover, Permission, Reschedule } from '@/pages/advanced-config';
import { BuildInAddon, ThridPartyAddon } from '@/pages/addon';
import ClusterManage from '@/pages/cluster-manage';
import NodeManage from '@/pages/node-manage';
import Login from '@/pages/login';
import { Icons } from '@/components/icons';
import { ConfigKind, ServiceKind, WorkloadKind } from '@/services/base';
import CustomResourcePage from '@/pages/multicloud-custom-resource/custom-resource';
import CustomResourceDefinitionPage from '@/pages/multicloud-custom-resource/custom-resource-definition';
import MonitoringConfig from '@/pages/basic-config/monitoring-config';
import UserSettings from '@/pages/basic-config/users-setting';
import ContinuousDeliveryApplicationPage from '@/pages/continuous-delivery/application';
import ContinuousDeliveryProjectPage from '@/pages/continuous-delivery/project';
import ContinuousDeliveryApplicationSetPage from '@/pages/continuous-delivery/application-set';
import InitTokenPage from '@/pages/login/init-token';
import PersistentVolumePage from '@/pages/multicloud-storage-manage/persistent-volume';
import FederationNamespacesPage from '@/pages/federation-resources/namespaces';
import FederationServicesPage from '@/pages/federation-resources/services';
import FederationWorkloadsPage from '@/pages/federation-resources/workloads';

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
          path: '/cluster-manage',
          element: <ClusterManage />,
          handle: {
            sidebarKey: 'CLUSTER-MANAGE',
            sidebarName: 'Clusters',
            icon: <Icons.clusters {...IconStyles} />,
          },
        },
        {
          path: '/node-manage',
          element: <NodeManage />,
          handle: {
            sidebarKey: 'NODE-MANAGE',
            sidebarName: 'Nodes',
            icon: <Icons.node {...IconStyles} />,
          },
        },
        {
          path: 'namespace',
          element: <MultiCloudNamespace />,
          handle: {
            sidebarKey: 'NAMESPACE',
            sidebarName: i18nInstance.t(
              'a4b28a416f0b6f3c215c51e79e517298',
              '命名空间',
            ),
            icon: <Icons.namespace {...IconStyles} />,
          },
        },
        {
          path: '/multicloud-resource-manage',
          handle: {
            sidebarKey: 'MULTICLOUD-RESOURCE-MANAGE',
            sidebarName: i18nInstance.t('c3bc562e9ffcae6029db730fe218515c'),
            isPage: false,
            icon: <Icons.resource {...IconStyles} />,
          },
          children: [
            {
              path: 'pod',
              element: <MultiCloudworkload kind={WorkloadKind.Pod}/>,
              handle: {
                sidebarKey: 'POD',
                sidebarName: 'Pod',
              },
            },
            {
              path: 'deployment',
              element: <MultiCloudworkload kind={WorkloadKind.Deployment}/>,
              handle: {
                sidebarKey: 'DEPLOYMENT',
                sidebarName: 'Deployment',
              },
            },
            {
              path: 'statefulset',
              element: <MultiCloudworkload kind={WorkloadKind.Statefulset}/>,
              handle: {
                sidebarKey: 'STATEFULSET',
                sidebarName: 'StatefulSet',
              },
            },
            {
              path: 'daemonset',
              element: <MultiCloudworkload kind={WorkloadKind.Daemonset}/>,
              handle: {
                sidebarKey: 'DAEMONSET',
                sidebarName: 'DaemonSet',
              },
            },
            {
              path: 'replicaset',
              element: <MultiCloudworkload kind={WorkloadKind.ReplicaSet}/>,
              handle: {
                sidebarKey: 'REPLICASET',
                sidebarName: 'ReplicaSet',
              },
            },
            {
              path: 'cronjob',
              element: <MultiCloudworkload kind={WorkloadKind.Cronjob}/>,
              handle: {
                sidebarKey: 'CRONJOB',
                sidebarName: 'CronJob',
              },
            },
            {
              path: 'job',
              element: <MultiCloudworkload kind={WorkloadKind.Job}/>,
              handle: {
                sidebarKey: 'JOB',
                sidebarName: 'Job',
              },
            },
          ],
        },
        {
          path: '/multicloud-service-manage',
          handle: {
            sidebarKey: 'MULTICLOUD-SERVICE-MANAGE',
            sidebarName: 'Service Discovery',
            icon: <Icons.serviceDiscovery {...IconStyles} />,
            isPage: false,
          },
          children: [
            {
              path: 'service',
              element: <MultiCloudService kind={ServiceKind.Service} />,
              handle: {
                sidebarKey: 'SERVICE',
                sidebarName: i18nInstance.t('4653569c7943335f62caa11e38d48aa0'),
              },
            },
            {
              path: 'ingress',
              element: <MultiCloudService kind={ServiceKind.Ingress} />,
              handle: {
                sidebarKey: 'INGRESS',
                sidebarName: 'Ingress',
              },
            },
          ]
        },
        {
          path: '/multicloud-storage-manage',
          handle: {
            sidebarKey: 'MULTICLOUD-STORAGE-MANAGE',
            sidebarName: 'Config and Storage',
            icon: <Icons.storage {...IconStyles} />,
            isPage: false,
          },
          children: [
            {
              path: 'configmap',
              element: <MultiCloudConfig kind={ConfigKind.ConfigMap} />,
              handle: {
                sidebarKey: 'CONFIGMAP',
                sidebarName: 'ConfigMap',
              },
            },
            {
              path: 'secret',
              element: <MultiCloudConfig kind={ConfigKind.Secret} />,
              handle: {
                sidebarKey: 'SECRET',
                sidebarName: 'Secret',
              },
            },
            {
              path: 'persistent-volume',
              element: <PersistentVolumePage />,
              handle: {
                sidebarKey: 'PERSISTENT-VOLUME',
                sidebarName: 'Persistent Volume',
              },
            },
          ]
        },
        {
          path: '/multicloud-custom-resource',
          handle: {
            sidebarKey: 'MULTICLOUD-CUSTOM-RESOURCE',
            sidebarName: 'Custom Resources',
            icon: <Icons.custom {...IconStyles} />,
            isPage: false,
          },
          children: [
            {
              path: 'custom-resource-definition',
              element: <CustomResourceDefinitionPage />,
              handle: {
                sidebarKey: 'CUSTOM-RESOURCE-DEFINITION',
                sidebarName: 'Custom Resource Definition',
              },
            },
            {
              path: 'custom-resource',
              element: <CustomResourcePage />,
              handle: {
                sidebarKey: 'CUSTOM-RESOURCE',
                sidebarName: 'Custom Resource',
              },
            },
          ],
        },
        {
          path: '/continuous-delivery',
          handle: {
            sidebarKey: 'CONTINUOUS-DELIVERY',
            sidebarName: 'Continuous Delivery',
            icon: <Icons.continuousDelivery {...IconStyles} />,
            isPage: false,
          },
          children: [
            {
              path: 'application',
              element: <ContinuousDeliveryApplicationPage />,
              handle: {
                sidebarKey: 'APPLICATION',
                sidebarName: 'Application',
              },
            },
            {
              path: 'application-set',
              element: <ContinuousDeliveryApplicationSetPage />,
              handle: {
                sidebarKey: 'APPLICATION-SET',
                sidebarName: 'Application Set',
              },
            },
            {
              path: 'project',
              element: <ContinuousDeliveryProjectPage />,
              handle: {
                sidebarKey: 'PROJECT',
                sidebarName: 'Project',
              },
            },
          ]
        },
        {
          path: '/federation-resources',
          handle: {
            sidebarKey: 'FEDERATION-RESOURCES',
            sidebarName: 'Federation Resources',
            icon: <Icons.federation {...IconStyles} />,
            isPage: false,
          },
          children: [
            {
              path: 'namespaces',
              element: <FederationNamespacesPage />,
              handle: {
                sidebarKey: 'FEDERATION-NAMESPACES',
                sidebarName: 'Namespaces',
              },
            },
            {
              path: 'workloads',
              element: <FederationWorkloadsPage />,
              handle: {
                sidebarKey: 'FEDERATION-WORKLOADS',
                sidebarName: 'Workloads',
              },
            },
            {
              path: 'services',
              element: <FederationServicesPage />,
              handle: {
                sidebarKey: 'FEDERATION-SERVICES',
                sidebarName: 'Services',
              },
            },
            {
              path: 'propagation-policy',
              element: <MultiCloudPropagationPolicy />,
              handle: {
                sidebarKey: 'PROPAGATION-POLICY',
                sidebarName: i18nInstance.t('a95abe7b8eeb55427547e764bf39f1c4'),
              },
            },
            {
              path: 'override-policy',
              element: <MultiCloudOverridePolicy />,
              handle: {
                sidebarKey: 'OVERRIDE-POLICY',
                sidebarName: i18nInstance.t('0a7e9443c41575378d2db1e288d3f1cb'),
              },
            },
          ],
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
              path: 'oem',
              element: <Oem />,
              handle: {
                sidebarKey: 'OEM',
                sidebarName: i18nInstance.t('bdf0eb5121c6dd3b2c57ab9d01b02a7e'),
              },
            },
            {
              path: 'upgrade',
              element: <Upgrade />,
              handle: {
                sidebarKey: 'UPGRADE',
                sidebarName: i18nInstance.t('0506797675615f94ddf57bebca9da81f'),
              },
            },
            {
              path: 'monitoring-config',
              element: <MonitoringConfig />,
              handle: {
                sidebarKey: 'MONITORING-CONFIG',
                sidebarName: 'Monitoring Config',
              },
            },
            {
              path: 'users-setting',
              element: <UserSettings />,
              handle: {
                sidebarKey: 'USERS-SETTING',
                sidebarName: 'User Settings',
              },
            },
            {
              path: 'karmada-config',
              element: <KarmadaConfig />,
              handle: {
                sidebarKey: 'KARMADA-CONFIG',
                sidebarName: i18nInstance.t('3955f4df8c2b4cb52d3c91296308edef'),
              },
            },
            {
              path: 'helm',
              element: <Helm />,
              handle: {
                sidebarKey: 'HELM',
                sidebarName: i18nInstance.t('f8bb304d7eae5ddba6ac13bf6931187b'),
              },
            },
            {
              path: 'registry',
              element: <Registry />,
              handle: {
                sidebarKey: 'REGISTRY',
                sidebarName: i18nInstance.t('c8330a63d6dfbb7dabb24cbf26430cb4'),
              },
            },
          ],
        },
        {
          path: '/advanced-config',
          handle: {
            sidebarKey: 'ADVANCED-CONFIG',
            sidebarName: i18nInstance.t(
              '1f318234cab713b51b5172d91770bc11',
              '高级配置',
            ),
            icon: <Icons.advancedConfig {...IconStyles} />,
            isPage: false,
          },
          children: [
            {
              path: 'failover',
              element: <Failover />,
              handle: {
                sidebarKey: 'FAILOVER',
                sidebarName: i18nInstance.t('41c84a00fe4f8f03d3f06a5887de31c8'),
              },
            },
            {
              path: 'reschedule',
              element: <Reschedule />,
              handle: {
                sidebarKey: 'RESCHEDULE',
                sidebarName: i18nInstance.t('28a905999d14769b2aae998b74c1a864'),
              },
            },
            {
              path: 'permission',
              element: <Permission />,
              handle: {
                sidebarKey: 'PERMISSION',
                sidebarName: i18nInstance.t('23bbdd59d0b1d94621fc98e7f533ad9f'),
              },
            },
          ],
        },
        {
          path: '/addon',
          handle: {
            sidebarKey: 'ADDON',
            sidebarName: i18nInstance.t('14c4e4ecdac2ff3337385747dda6e621'),
            icon: <Icons.addon {...IconStyles} />,
            isPage: false,
          },
          children: [
            {
              path: 'buildin',
              element: <BuildInAddon />,
              handle: {
                sidebarKey: 'BUILDIN',
                sidebarName: i18nInstance.t('976eb1e050088fbdd7d2cab3f644e7e5'),
              },
            },
            {
              path: 'thirdparty',
              element: <ThridPartyAddon />,
              handle: {
                sidebarKey: 'THIRDPARTY',
                sidebarName: i18nInstance.t('fb7f97d757a27c46d1e4f03287d9dd1f'),
              },
            },
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
