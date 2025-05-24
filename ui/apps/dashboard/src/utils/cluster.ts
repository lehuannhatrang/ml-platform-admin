import { DEFAULT_CLUSTER_OPTION } from "@/hooks/use-cluster";

// Function to generate a color from a string
export const getClusterColorByValue = (value: string) => {
    if (value === DEFAULT_CLUSTER_OPTION.label) return '#52c41a'; // Default color for 'All clusters'

    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash % 360);
    const saturation = 60 + Math.abs(hash % 20); // Between 60-80%
    const lightness = 45 + Math.abs(hash % 10); // Between 45-55%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

export const getClusterApiPath = (clusterName: string, targetApi: string, useAggregatedApi = true) => {
    if (clusterName === DEFAULT_CLUSTER_OPTION.label || !clusterName) return `${useAggregatedApi ? '/aggregated' : ''}/${targetApi}`;
    if (clusterName === 'mgmt-cluster') return `/mgmt-cluster/${targetApi}`;
    return `/member/${clusterName}/${targetApi}`;
};
