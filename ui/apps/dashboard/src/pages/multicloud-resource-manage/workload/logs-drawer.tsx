import { FC, useEffect, useMemo, useState } from 'react';
import {
    Drawer,
    Select,
    Flex
} from 'antd';
import {
    GetContainerLogs,
} from '@/services/workload.ts';
import { useQuery } from '@tanstack/react-query';
import { WorkloadKind } from '@/services/base.ts';
import LogsTerminal from '@/components/logs-terminal';

export interface LogsDrawerProps {
    open: boolean;
    kind: WorkloadKind;
    namespace: string;
    name: string;
    cluster: string;
    onClose: () => void;
    containers: string[];
}

const LogsDrawer: FC<LogsDrawerProps> = (props) => {
    const { open, kind, namespace, name, onClose, cluster, containers } = props;

    const [selectedContainer, setSelectedContainer] = useState(containers[0] || '');

    const [aggregatedLogs, setAggregatedLogs] = useState('');

    const [page, setPage] = useState(1);

    const enableFetch = useMemo(() => {
        return !!(kind && name && namespace && cluster && selectedContainer && page);
    }, [kind, name, namespace, cluster, selectedContainer, page]);

    const { data: containerLogs, isLoading: isLogsLoading } = useQuery({
        queryKey: ['GetContainerLogs', kind, cluster, name, namespace, selectedContainer, page],
        queryFn: async () => {
            const containerLogs = await GetContainerLogs({
                namespace,
                name,
                container: selectedContainer,
                cluster,
                page,
            });
            setAggregatedLogs((prev) => (containerLogs.data?.logs || '') + prev);
            return containerLogs.data || {};
        },
        enabled: enableFetch,
    });

    const fetchNextPage = () => {
        if (!containerLogs?.totalPages || page >= containerLogs.totalPages) {
            return;
        }
        setPage((prev) => prev + 1);
    }

    const handleOnCloseDrawer = () => {
        setAggregatedLogs('');
        setPage(1);
        setSelectedContainer('');
        onClose();
    }

    useEffect(() => {
        setSelectedContainer(containers[0] || '');
    }, [containers])

    return (
        <Drawer
            title={`Logs: ${name}`}
            placement="bottom"
            open={open}
            height='100vh'
            loading={isLogsLoading && page === 1}
            onClose={handleOnCloseDrawer}
            extra={
            <Flex align='center' gap={8}>
                <p className="text-gray-500">Container:</p>
                <Select
                    placeholder={'Select a container'}
                    className={'min-w-[250px]'}
                    value={selectedContainer}
                    options={containers.map((i) => ({ value: i, label: i }))}
                    onChange={(value) => {
                        setSelectedContainer(value as string);
                        setAggregatedLogs('');
                        setPage(1);
                    }}
                />
            </Flex>
            }
        >
            {open && <LogsTerminal
                logs={aggregatedLogs}
                onLoadMore={!containerLogs?.totalPages || page >= containerLogs.totalPages ? undefined : fetchNextPage}
                style={{
                    height: '100%'
                }}
                isLoading={isLogsLoading}
            />}

        </Drawer>
    );
};

export default LogsDrawer;
