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
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

const SELECTED_CLUSTER_KEY = 'selectedCluster';
const SELECTED_CLUSTER_QUERY_KEY = 'selectedClusterState';

export const getStoredCluster = (): ClusterOption => {
    const stored = localStorage.getItem(SELECTED_CLUSTER_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            return DEFAULT_CLUSTER_OPTION;
        }
    }
    return DEFAULT_CLUSTER_OPTION;
};

export const setStoredCluster = (cluster: ClusterOption) => {
    localStorage.setItem(SELECTED_CLUSTER_KEY, JSON.stringify(cluster));
};

const useCluster = (props: { clusterFilter?: DataSelectQuery, allowSelectAll?: boolean }) => {
    const { clusterFilter = {}, allowSelectAll = true } = props;
    const queryClient = useQueryClient();

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

    const { data: selectedCluster = getStoredCluster() } = useQuery({
        queryKey: [SELECTED_CLUSTER_QUERY_KEY],
        initialData: getStoredCluster(),
        enabled: false, // This query never fetches, just manages state
    });

    const clusterOptions: ClusterOption[] = useMemo(() => {
        if (!clusterData?.clusters) return [];
        return [
            ...(allowSelectAll ? [DEFAULT_CLUSTER_OPTION] : []),
            ...clusterData.clusters.map((item) => ({
                label: item.objectMeta.name,
                value: item.objectMeta.uid,
            })),
        ];
    }, [clusterData, allowSelectAll]);
    
    const setSelectedCluster = (cluster: ClusterOption) => {
        setStoredCluster(cluster);
        queryClient.setQueryData([SELECTED_CLUSTER_QUERY_KEY], cluster);
    };

    return {
        clusterOptions,
        isClusterDataLoading: isLoading,
        selectedCluster,
        setSelectedCluster,
        refetchClusterData: refetch,
    };
};

export default useCluster;
