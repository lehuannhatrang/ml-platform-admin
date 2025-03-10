import React, { useEffect, useRef, useState } from 'react';
import { Row, Select } from 'antd';
import LogsTerminal from '@/components/logs-terminal';

interface TerminalLogsProps {
    logs: Record<string, string>;
    style?: React.CSSProperties;
}

const TerminalLogs: React.FC<TerminalLogsProps> = ({ logs, style }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    const podsOptions = Object.entries(logs).map(([podName]) => ({ label: podName, value: podName }));

    const [selectedPod, setSelectedPod] = useState<string | null>(podsOptions.length > 0 ? podsOptions[0].value : null);

    const [visibleLines, setVisibleLines] = useState(50);

    const allLines = selectedPod && logs[selectedPod] ? logs[selectedPod].split('\n') : [];

    const displayedLines = allLines.slice(Math.max(allLines.length - visibleLines, 0));

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, selectedPod])

    return (
        <div style={style}>
            <Row>
                <h3 className='mr-2 leading-[32px]'>Container:</h3>
                <Select
                    options={podsOptions}
                    value={selectedPod}
                    onChange={setSelectedPod}
                    className='mb-4'
                />
            </Row>
            <LogsTerminal
                logs={displayedLines.join('\n')}
                onScrollTop={() => {setVisibleLines((prev) => Math.min(prev + 50 + 2, allLines.length))}}
            />
        </div>
    )
};

export default TerminalLogs;