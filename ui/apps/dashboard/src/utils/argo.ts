export const getSyncStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
        case 'synced':
            return 'green';
        case 'outofdate':
        case 'outofsynced':
            return 'orange';
        case 'failed':
            return 'red';
        default:
            return 'default';
    }
};

export const getHealthStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
        case 'healthy':
            return 'green';
        case 'degraded':
            return 'red';
        case 'progressing':
            return 'blue';
        case 'suspended':
            return 'orange';
        default:
            return 'default';
    }
};