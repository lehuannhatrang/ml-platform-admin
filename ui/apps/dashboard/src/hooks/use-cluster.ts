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

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GetClusters } from '@/services';
import { DataSelectQuery } from '@/services/base.ts';

export type ClusterOption = {
    label: string;
    value: string;
}

export const DEFAULT_CLUSTER_OPTION: ClusterOption = {
    label: 'All clusters',
    value: 'ALL',
};

const useCluster = (props: { clusterFilter?: DataSelectQuery }) => {
    const { clusterFilter = {} } = props;
    const {
        data: clusterData,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['GetClusters', clusterFilter],
        queryFn: async () => {
            const response = await GetClusters();
            return response.data || {};
        },
    });
    const clusterOptions: ClusterOption[] = useMemo(() => {
        if (!clusterData?.clusters) return [];
        return [
            DEFAULT_CLUSTER_OPTION, 
            ...clusterData.clusters.map((item) => {
            return {
                label: item.objectMeta.name,
                value: item.objectMeta.uid,
            };
        })];
    }, [clusterData]);
    return {
        clusterOptions,
        isClusterDataLoading: isLoading,
        refetchClusterData: refetch,
    };
};

export default useCluster;
