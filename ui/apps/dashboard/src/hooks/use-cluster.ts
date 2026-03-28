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

import { useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GetClusters } from '@/services';
import { DataSelectQuery } from '@/services/base.ts';
import { GetDashboardConfig } from '@/services/dashboard-config';

export type ClusterOption = {
    label: string;
    value: string;
    ready?: boolean;
}

export const DEFAULT_CLUSTER_OPTION: ClusterOption = {
    label: 'All Regions',
    value: 'ALL',
    ready: true,
};

// Default local cluster option - actual name comes from config
export const DEFAULT_LOCAL_CLUSTER_NAME = 'local-cluster';

// Helper to create local cluster option with the configured name
export const createLocalClusterOption = (name?: string): ClusterOption => ({
    label: 'Local Cluster',
    value: name || DEFAULT_LOCAL_CLUSTER_NAME,
    ready: true,
});

// Legacy export for compatibility
export const LOCAL_CLUSTER_OPTION: ClusterOption = {
    label: 'Local Cluster',
    value: DEFAULT_LOCAL_CLUSTER_NAME,
    ready: true,
};

const SELECTED_CLUSTER_KEY = 'selectedCluster';
const SELECTED_CLUSTER_QUERY_KEY = 'selectedClusterState';

export const getStoredCluster = (): ClusterOption | null => {
    const stored = localStorage.getItem(SELECTED_CLUSTER_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            return null;
        }
    }
    return null;
};

export const setStoredCluster = (cluster: ClusterOption) => {
    localStorage.setItem(SELECTED_CLUSTER_KEY, JSON.stringify(cluster));
};

const useCluster = (props: { clusterFilter?: DataSelectQuery, allowSelectAll?: boolean }) => {
    const { clusterFilter = {}, allowSelectAll = true } = props;
    const queryClient = useQueryClient();

    // Fetch dashboard config to get the local cluster name and karmada status
    const { data: configData } = useQuery({
        queryKey: ['dashboardConfigForCluster'],
        queryFn: async () => {
            const response = await GetDashboardConfig();
            return response.data;
        },
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });

    const localClusterName = configData?.local_cluster_name || DEFAULT_LOCAL_CLUSTER_NAME;
    const karmadaEnabled = configData?.karmada_enabled ?? true;

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

    const { data: selectedCluster = DEFAULT_CLUSTER_OPTION } = useQuery({
        queryKey: [SELECTED_CLUSTER_QUERY_KEY],
        initialData: getStoredCluster() ?? DEFAULT_CLUSTER_OPTION,
        enabled: false, // This query never fetches, just manages state
    });

    const clusterOptions: ClusterOption[] = useMemo(() => {
        if (!clusterData?.clusters) return [];
        
        // Map clusters to options
        const clusters = clusterData.clusters.map((item) => ({
            label: item.objectMeta.labels?.region ? `${item.objectMeta.labels.region}` : item.objectMeta.name,
            value: item.objectMeta.name,
            ready: item?.ready === "True",
        }));
        
        // Only show "All Regions" if Karmada is enabled and there's more than one cluster
        const showAllOption = allowSelectAll && karmadaEnabled && clusters.length > 1;
        
        return [
            ...(showAllOption ? [DEFAULT_CLUSTER_OPTION] : []),
            ...clusters,
        ];
    }, [clusterData, allowSelectAll, karmadaEnabled]);

    const setSelectedCluster = (cluster: ClusterOption) => {
        setStoredCluster(cluster);
        queryClient.setQueryData([SELECTED_CLUSTER_QUERY_KEY], cluster);
    };

    // Auto-select the first real cluster when clusters load and no explicit
    // choice has been stored (or the stored value is still the 'ALL' default).
    useEffect(() => {
        if (!clusterOptions.length) return;
        const stored = getStoredCluster();
        const noExplicitChoice = stored === null || stored.value === DEFAULT_CLUSTER_OPTION.value;
        if (noExplicitChoice) {
            const firstCluster = clusterOptions.find(c => c.value !== DEFAULT_CLUSTER_OPTION.value);
            if (firstCluster) {
                setSelectedCluster(firstCluster);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clusterOptions]);

    return {
        clusterOptions,
        isClusterDataLoading: isLoading,
        selectedCluster,
        setSelectedCluster,
        refetchClusterData: refetch,
        localClusterName,
        karmadaEnabled,
    };
};

export default useCluster;
