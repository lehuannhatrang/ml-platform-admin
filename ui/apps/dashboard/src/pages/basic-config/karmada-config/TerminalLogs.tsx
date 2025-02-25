import React, { useEffect, useRef, useState } from 'react';
import { Row, Select } from 'antd';

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

    const handleScroll = () => {
        const container = logContainerRef.current;
        if (container && container.scrollTop === 0) {
            setVisibleLines((prev) => Math.min(prev + 50 + 2, allLines.length));
        }
    };
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, selectedPod])

    return (
        <div style={style}>
            <Row>
                <h3 className='mr-2 leading-[32px]'>Pod:</h3>
                <Select
                    options={podsOptions}
                    value={selectedPod}
                    onChange={setSelectedPod}
                    className='mb-4'
                />
            </Row>
            {selectedPod && <div
                ref={logContainerRef}
                onScroll={handleScroll}
                style={{
                    backgroundColor: '#1e1e1e',
                    borderRadius: '4px',
                    padding: '8px',
                    maxHeight: '500px',
                    overflowY: 'auto',
                }}
            >
                <pre
                    style={{
                        color: '#00ff00',
                        margin: 0,
                        fontFamily: '"Consolas", "Courier New", monospace',
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                    }}
                >
                    {displayedLines.join('\n')}
                </pre>
            </div>
            }

        </div>
    )
};

export default TerminalLogs;