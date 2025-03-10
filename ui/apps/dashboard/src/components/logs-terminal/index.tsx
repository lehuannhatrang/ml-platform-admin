import React, { useEffect, useRef } from 'react';

interface TerminalLogsProps {
    logs: string;
    style?: React.CSSProperties;
    onScrollTop?: () => void;
    isLoading?: boolean;
}

const LogsTerminal: React.FC<TerminalLogsProps> = ({ logs, style, onScrollTop, isLoading=false }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    const handleScroll = () => {
        const container = logContainerRef.current;
        if (container && container.scrollTop === 0) {
            onScrollTop?.()
        }
    };

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [])

    return (
        <div
            ref={logContainerRef}
            onScroll={handleScroll}
            style={{
                backgroundColor: '#1e1e1e',
                borderRadius: '4px',
                padding: '8px',
                maxHeight: '500px',
                overflowY: 'auto',
                ...style
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
                {isLoading && <div>Loading...</div>}
                {!isLoading && !logs && <div>No logs available</div>}
                {logs}
            </pre>
        </div>
    )
};

export default LogsTerminal;