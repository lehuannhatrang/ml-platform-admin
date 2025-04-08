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
import Panel from '@/components/panel';
import { App, Button, Input, Select, Flex } from 'antd';
import { ServiceKind } from '@/services/base';
import { Icons } from '@/components/icons';
import { useCallback, useState, useEffect } from 'react';
import { useToggle, useWindowSize } from '@uidotdev/usehooks';
import ServiceTable from './components/service-table';
import ServiceEditorModal from './components/service-editor-modal';
import { stringify } from 'yaml';
import IngressTable from '@/pages/multicloud-resource-manage/service/components/ingress-table';
import useNamespace from '@/hooks/use-namespace.ts';
import { useQueryClient } from '@tanstack/react-query';
import { DeleteMemberResource, DeleteResource } from '@/services/unstructured.ts';
import { useCluster } from '@/hooks';
import ServiceInfoDrawer from './components/service-info-drawer';
import IngressInfoDrawer from './components/ingress-info-drawer';
import { useSearchParams } from 'react-router-dom';

export type ServicePageProps = {
  kind: ServiceKind;
}

const ServicePage = ({ kind }: ServicePageProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const { selectedCluster } = useCluster({});

  const [filter, setFilter] = useState<{
    selectedWorkSpace: string;
    searchText: string;
  }>({
    selectedWorkSpace: '',
    searchText: '',
  });

  // Service drawer state
  const [serviceDrawerData, setServiceDrawerData] = useState<{
    open: boolean;
    namespace: string;
    name: string;
    cluster: string;
  }>({
    open: false,
    namespace: '',
    name: '',
    cluster: '',
  });

  // Ingress drawer state
  const [ingressDrawerData, setIngressDrawerData] = useState<{
    open: boolean;
    namespace: string;
    name: string;
    cluster: string;
  }>({
    open: false,
    namespace: '',
    name: '',
    cluster: '',
  });

  // Handle close drawer functions
  const handleCloseServiceDrawer = () => {
    setSearchParams({});
    setServiceDrawerData({
      open: false,
      namespace: '',
      name: '',
      cluster: '',
    });
  };

  const handleCloseIngressDrawer = () => {
    setSearchParams({});
    setIngressDrawerData({
      open: false,
      namespace: '',
      name: '',
      cluster: '',
    });
  };

  // Check URL params for view actions
  useEffect(() => {
    const action = searchParams.get('action');
    const name = searchParams.get('name');
    const namespace = searchParams.get('namespace');
    const cluster = searchParams.get('cluster');

    if (action === 'view' && name && namespace && cluster) {
      if (kind === ServiceKind.Service) {
        setServiceDrawerData({
          open: true,
          name,
          namespace,
          cluster,
        });
      } else if (kind === ServiceKind.Ingress) {
        setIngressDrawerData({
          open: true,
          name,
          namespace,
          cluster,
        });
      }
    }
  }, [searchParams, kind]);

  const { nsOptions, isNsDataLoading } = useNamespace({});
  const size = useWindowSize();
  const labelTagNum = size && size.width! > 1800 ? undefined : 1;
  const [editorState, setEditorState] = useState<{
    mode: 'create' | 'edit' | 'detail';
    content: string;
    cluster: string;
  }>({
    mode: 'create',
    content: '',
    cluster: '',
  });
  const [showModal, toggleShowModal] = useToggle(false);
  const resetEditorState = useCallback(() => {
    setEditorState({
      mode: 'create',
      content: '',
      cluster: '',
    });
  }, []);
  const { message: messageApi } = App.useApp();
  const queryClient = useQueryClient();

  return (
    <Panel>
      <div className={'flex flex-row justify-between mb-4'}>
        <Flex>
          <Flex className='mr-4'>
            <h3 className={'leading-[32px] mr-2'}>
              {i18nInstance.t('280c56077360c204e536eb770495bc5f', '命名空间')}:
            </h3>
            <Select
              options={nsOptions}
              className={'min-w-[200px]'}
              value={filter.selectedWorkSpace}
              loading={isNsDataLoading}
              showSearch
              allowClear
              onChange={(v) => {
                setFilter({
                  ...filter,
                  selectedWorkSpace: v,
                });
              }}
            />
          </Flex>
          <Input.Search
            placeholder={i18nInstance.t(
              'cfaff3e369b9bd51504feb59bf0972a0',
              '按命名空间搜索',
            )}
            className={'w-[300px]'}
            onPressEnter={(e) => {
              const input = e.currentTarget.value;
              setFilter({
                ...filter,
                searchText: input,
              });
            }}
          />
        </Flex>
        <Button
          type={'primary'}
          icon={<Icons.add width={16} height={16} />}
          className="flex flex-row items-center"
          onClick={() => {
            toggleShowModal(true);
          }}
        >
          {i18nInstance.t('c7961c290ec86485d8692f3c09b4075b', '新增服务')}
        </Button>
      </div>
      {kind === ServiceKind.Service && (
        <ServiceTable
          clusterOption={selectedCluster}
          labelTagNum={labelTagNum}
          searchText={filter.searchText}
          selectedWorkSpace={filter.selectedWorkSpace}
          onEditServiceContent={(r, clusterName) => {
            setEditorState({
              mode: 'edit', 
              content: stringify(r),
              cluster: clusterName,
            });
            toggleShowModal(true);
          }}
          onDeleteServiceContent={async (r, clusterName) => {
            try {
              const ret = await DeleteMemberResource({
                kind: r.typeMeta.kind,
                name: r.objectMeta.name,
                namespace: r.objectMeta.namespace,
                cluster: clusterName,
              });
              if (ret.code !== 200) {
                await messageApi.error(
                  i18nInstance.t(
                    '1ed71b1211f5d2ba41e4a23331985c7c',
                    '删除服务失败',
                  ),
                );
              }
              await queryClient.invalidateQueries({
                queryKey: ['GetServices'],
                exact: false,
              });
            } catch (e) {
              console.log('error', e);
            }
          }}
          onViewService={(r, clusterName) => {
            setSearchParams({
              action: 'view',
              name: r.objectMeta.name,
              namespace: r.objectMeta.namespace,
              cluster: clusterName,
            });
            setServiceDrawerData({
              open: true,
              name: r.objectMeta.name,
              namespace: r.objectMeta.namespace,
              cluster: clusterName,
            });
          }}
        />
      )}
      {kind === ServiceKind.Ingress && (
        <IngressTable
          clusterOption={selectedCluster}
          searchText={filter.searchText}
          selectedWorkSpace={filter.selectedWorkSpace}
          onEditIngressContent={(r, clusterName) => {
            setEditorState({
              mode: 'edit',
              content: stringify(r),
              cluster: clusterName,
            });
            toggleShowModal(true);
          }}
          onDeleteIngressContent={async (r) => {
            try {
              const ret = await DeleteResource({
                kind: r.typeMeta.kind,
                name: r.objectMeta.name,
                namespace: r.objectMeta.namespace,
              });
              if (ret.code !== 200) {
                await messageApi.error(
                  i18nInstance.t(
                    '1ed71b1211f5d2ba41e4a23331985c7c',
                    '删除服务失败',
                  ),
                );
              }
              await queryClient.invalidateQueries({
                queryKey: ['GetIngress'],
                exact: false,
              });
            } catch (e) {
              console.log('error', e);
            }
          }}
          onViewIngress={(r, clusterName) => {
            setSearchParams({
              action: 'view',
              name: r.objectMeta.name,
              namespace: r.objectMeta.namespace,
              cluster: clusterName,
            });
            setIngressDrawerData({
              open: true,
              name: r.objectMeta.name,
              namespace: r.objectMeta.namespace,
              cluster: clusterName,
            });
          }}
        />
      )}

      <ServiceEditorModal
        cluster={editorState.cluster}
        mode={editorState.mode}
        open={showModal}
        serviceContent={editorState.content}
        onOk={async (ret) => {
          if (ret.code === 200) {
            await messageApi.success(
              editorState.mode === 'edit'
                ? i18nInstance.t('55aa6366c0d09a392d8acf54c4c4b837', '更新成功')
                : i18nInstance.t(
                  '04a691b377c91da599d5b4b62b0cb114',
                  '创建成功',
                ),
            );
            toggleShowModal(false);
            resetEditorState();
            // invalidate react query
            await queryClient.invalidateQueries({
              queryKey: [
                kind === ServiceKind.Service
                  ? 'GetServices'
                  : 'GetIngress',
                filter.selectedWorkSpace,
                filter.searchText,
              ],
            });
          } else {
            await messageApi.error(
              editorState.mode === 'edit'
                ? i18nInstance.t('930442e2f423436f9db3d8e91f648e93', '更新失败')
                : i18nInstance.t(
                  'a889286a51f3adab3cfb6913f2b0ac2e',
                  '创建失败',
                ),
            );
          }
        }}
        onCancel={() => {
          resetEditorState();
          toggleShowModal(false);
        }}
        kind={kind}
      />

      {/* Service Info Drawer */}
      <ServiceInfoDrawer
        open={serviceDrawerData.open}
        name={serviceDrawerData.name}
        namespace={serviceDrawerData.namespace}
        cluster={serviceDrawerData.cluster}
        onClose={handleCloseServiceDrawer}
      />

      {/* Ingress Info Drawer */}
      <IngressInfoDrawer
        open={ingressDrawerData.open}
        name={ingressDrawerData.name}
        namespace={ingressDrawerData.namespace}
        cluster={ingressDrawerData.cluster}
        onClose={handleCloseIngressDrawer}
      />
    </Panel>
  );
};
export default ServicePage;
