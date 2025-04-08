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
import { Button, Input, Select, Flex } from 'antd';
import { Icons } from '@/components/icons';
import { FC } from 'react';
import { FilterState } from '../types';
import { ConfigKind } from '@/services/base.ts';

interface QueryFilterProps {
  filter: FilterState;
  setFilter: (d: Partial<FilterState>) => void;
  onNewConfig: () => void;
  nsOptions: {
    title: string;
    value: string;
  }[];
  isNsDataLoading: boolean;
  kind: ConfigKind;
}

const QueryFilter: FC<QueryFilterProps> = (props) => {
  const { filter, setFilter, onNewConfig, nsOptions, isNsDataLoading, kind } = props;

  return (
    <div className={'flex flex-row justify-between space-x-4 mb-4'}>
        <Flex>
          <Flex className='mr-4'>
            <h3 className={'leading-[32px] mr-2'}>
              {i18nInstance.t('a4b28a416f0b6f3c215c51e79e517298', '命名空间')}
            </h3>
            <Select
              options={nsOptions}
              className={'min-w-[200px]'}
              value={filter.selectedWorkspace}
              loading={isNsDataLoading}
              showSearch
              allowClear
              onChange={(v) => {
                setFilter({
                  ...filter,
                  selectedWorkspace: v,
                });
              }}
            />
          </Flex>
          <Input.Search
            placeholder={i18nInstance.t(
              '6fb6674001277533ddf8fa605a981009',
              '按名称搜索',
            )}
            className={'w-[300px]'}
            value={filter.searchText}
            onChange={(e) => {
              const input = e.currentTarget.value;
              setFilter({
                ...filter,
                searchText: input,
              });
            }}
            onPressEnter={(e) => {
              const input = e.currentTarget.value;
              setFilter({
                ...filter,
                searchText: input,
              });
            }}
          />
        </Flex>
        <div className={'flex flex-row justify-between mb-4'}>
          <Button
            type={'primary'}
            icon={<Icons.add width={16} height={16} />}
            className="flex flex-row items-center"
            onClick={onNewConfig}
          >
            {kind === ConfigKind.ConfigMap
              ? i18nInstance.t('80e2ca37eabd710ead8581de48a54fed', '新增配置')
              : i18nInstance.t('12f9985489b76f8cd0775f5757b293d4', '新增秘钥')}
          </Button>
        </div>
    </div>
  );
};
export default QueryFilter;
