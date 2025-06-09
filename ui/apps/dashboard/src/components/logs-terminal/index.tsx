import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useTheme } from '@/contexts/theme-context';
import { Input, Select, Button, Tooltip, Flex } from 'antd';
import { FilterOutlined, ClearOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';

interface TerminalLogsProps {
    logs: string;
    style?: React.CSSProperties;
    onScrollTop?: () => void;
    onLoadMore?: () => void;
    isLoading?: boolean;
}

type LogLevel = 'all' | 'error' | 'warning' | 'info' | 'success' | 'debug';

// Constants for chunk size and processing delay to avoid UI blocking
const CHUNK_SIZE = 200; // Process logs in chunks of this size
const PROCESSING_DELAY = 0; // Delay between chunks in ms (0 for immediate processing)

const LogsTerminal: React.FC<TerminalLogsProps> = ({ logs, style, onScrollTop, isLoading=false, onLoadMore }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [logLevelFilter, setLogLevelFilter] = useState<LogLevel>('all');
    const [processedLogResults, setProcessedLogResults] = useState<JSX.Element[]>([]);
    const processingRef = useRef(false);
    const [isAtTop, setIsAtTop] = useState(false); // Track if scrolled to top
    
    // Search result navigation
    const [searchMatches, setSearchMatches] = useState<number[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
    const lineRefs = useRef<{[key: number]: HTMLSpanElement | null}>({});
    
    // Define theme-dependent colors
    const colors = useMemo(() => ({
        background: theme === 'dark' ? '#1e1e1e' : '#f5f5f5',
        text: theme === 'dark' ? '#d4d4d4' : '#333333',
        error: theme === 'dark' ? '#ff6b6b' : '#d32f2f',
        warning: theme === 'dark' ? '#ffcc00' : '#ed6c02',
        info: theme === 'dark' ? '#ffffff' : '#0288d1',
        success: theme === 'dark' ? '#98c379' : '#2e7d32',
        debug: theme === 'dark' ? '#c586c0' : '#9c27b0',
        controlBg: theme === 'dark' ? '#2a2a2e' : '#ffffff',
        controlBorder: theme === 'dark' ? '#3e3e42' : '#d9d9d9',
    }), [theme]);

    const handleScroll = () => {
        if (logContainerRef.current) {
            const { scrollTop } = logContainerRef.current;
            setIsAtTop(scrollTop === 0);
            if (scrollTop === 0 && onScrollTop) {
                onScrollTop();
            }
        }
    };

    const handleLoadMore = () => {
        if (onLoadMore) {
            onLoadMore();
        }
    };

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [])

    const errorRegex = /\b(error|err|exception|fail|failed|failure)\b/i;
    const warningRegex = /\b(warn|warning)\b/i;
    
    // Define patterns outside useMemo to avoid recreation
    const logPatterns = useMemo(() => [
        { level: 'error', regex: errorRegex, color: colors.error },
        { level: 'warning', regex: warningRegex, color: colors.warning },
        // Info level is all logs except error and warning
        { 
            level: 'info', 
            regex: (text: string) => !errorRegex.test(text) && !warningRegex.test(text), 
            color: colors.info 
        },
        { level: 'success', regex: /\b(success|succeeded|completed|done|ok)\b/i, color: colors.success },
        { level: 'debug', regex: /\b(debug|trace|verbose)\b/i, color: colors.debug },
    ], [colors.error, colors.warning, colors.info, colors.success, colors.debug]);

    // Process logs in chunks to avoid blocking the main thread
    useEffect(() => {
        if (!logs || processingRef.current) return;
        
        // Reset results when inputs change
        setProcessedLogResults([]);
        
        // Split logs by newlines
        const logLines = logs.split('\n');
        const totalLines = logLines.length;
        let processedResults: JSX.Element[] = [];
        let currentIndex = 0;
        
        processingRef.current = true;
        
        // Process logs in chunks
        const processLogChunk = () => {
            // Process a chunk of log lines
            const endIndex = Math.min(currentIndex + CHUNK_SIZE, totalLines);
            const chunk = logLines.slice(currentIndex, endIndex);
            
            const processedChunk = processChunk(chunk, currentIndex);
            processedResults = [...processedResults, ...processedChunk];
            
            // Update state with current processed results
            setProcessedLogResults(prev => [...prev, ...processedChunk]);
            
            // Update search matches after all chunks are processed
            if (currentIndex + CHUNK_SIZE >= totalLines && searchQuery) {
                // Find all matches in the entire result set
                const matches = processedResults.reduce((matchIndices, element, index) => {
                    // Check if this element has the search query
                    const props = element.props;
                    if (props && props.children) {
                        const hasMatch = typeof props.children === 'string' 
                            ? props.children.toLowerCase().includes(searchQuery.toLowerCase())
                            : Array.isArray(props.children) && props.children.some((child: any) => 
                                child && typeof child === 'object' && child.type === 'mark');
                        
                        if (hasMatch) {
                            matchIndices.push(index);
                        }
                    }
                    return matchIndices;
                }, [] as number[]);
                
                setSearchMatches(matches);
                if (matches.length > 0 && currentMatchIndex === -1) {
                    setCurrentMatchIndex(0); // Set to first match by default
                } else if (matches.length === 0) {
                    setCurrentMatchIndex(-1); // Reset if no matches
                }
            }
            
            currentIndex = endIndex;
            
            // If more logs to process, schedule next chunk
            if (currentIndex < totalLines) {
                setTimeout(processLogChunk, PROCESSING_DELAY);
            } else {
                // All logs processed
                processingRef.current = false;
            }
        };
        
        // Process first chunk
        processLogChunk();
        
        return () => {
            // Mark as not processing if the component unmounts or dependencies change
            processingRef.current = false;
        };
    }, [logs, searchQuery, logLevelFilter, logPatterns, currentMatchIndex]);
    // Function to process a chunk of logs
    const processChunk = useCallback((lines: string[], startIndex: number) => {
        return lines
            .filter(line => {
                // Apply search filter if query exists
                if (searchQuery && !line.toLowerCase().includes(searchQuery.toLowerCase())) {
                    return false;
                }
                
                // Apply log level filter
                if (logLevelFilter !== 'all') {
                    const pattern = logPatterns.find(p => p.level === logLevelFilter);
                    if (pattern) {
                        // Handle function-based regex (for info level)
                        if (typeof pattern.regex === 'function') {
                            if (!pattern.regex(line)) {
                                return false;
                            }
                        } else if (!pattern.regex.test(line)) { // Handle RegExp-based regex
                            return false;
                        }
                    }
                }
                
                return true;
            })
            .map((line, index) => {
                const lineIndex = startIndex + index;
                
                // Create a ref callback to store references to elements with matches
                const refCallback = (el: HTMLSpanElement | null) => {
                    if (searchQuery && line.toLowerCase().includes(searchQuery.toLowerCase())) {
                        lineRefs.current[lineIndex] = el;
                    }
                };
                
                // Find matching pattern for highlighting
                for (const pattern of logPatterns) {
                    const { color } = pattern;
                    const isMatch = typeof pattern.regex === 'function' 
                        ? pattern.regex(line) 
                        : pattern.regex.test(line);
                        
                    if (isMatch) {
                        // Highlight search term if it exists
                        if (searchQuery) {
                            const parts = line.split(new RegExp(`(${searchQuery})`, 'gi'));
                            return (
                                <span 
                                    ref={refCallback}
                                    key={lineIndex} 
                                    style={{ 
                                        color, 
                                        display: 'block',
                                        backgroundColor: searchMatches[currentMatchIndex] === lineIndex ? '#0000ff' : 'transparent'
                                    }}
                                >
                                    {parts.map((part, i) => 
                                        part.toLowerCase() === searchQuery.toLowerCase() 
                                            ? <mark key={i} style={{ backgroundColor: '#ffff0044', color: 'inherit' }}>{part}</mark> 
                                            : part
                                    )}
                                </span>
                            );
                        }
                        
                        return (
                            <span 
                                ref={refCallback}
                                key={lineIndex} 
                                style={{ 
                                    color, 
                                    display: 'block',
                                    backgroundColor: searchMatches[currentMatchIndex] === lineIndex ? '#0000ff' : 'transparent'
                                }}
                            >
                                {line}
                            </span>
                        );
                    }
                }
                
                // Handle regular lines (with search highlighting if needed)
                if (searchQuery) {
                    const parts = line.split(new RegExp(`(${searchQuery})`, 'gi'));
                    return (
                        <span 
                            ref={refCallback}
                            key={lineIndex} 
                            style={{ 
                                display: 'block',
                                backgroundColor: searchMatches[currentMatchIndex] === lineIndex ? '#ffff0088' : 'transparent'
                            }}
                        >
                            {parts.map((part, i) => 
                                part.toLowerCase() === searchQuery.toLowerCase() 
                                    ? <mark key={i} style={{ backgroundColor: '#ffff0044', color: 'inherit' }}>{part}</mark> 
                                    : part
                            )}
                        </span>
                    );
                }
                
                return <span key={lineIndex} style={{ display: 'block' }}>{line}</span>;
            });
    }, [searchQuery, logLevelFilter, logPatterns, currentMatchIndex]);

    // Clear all filters
    const clearFilters = () => {
        setSearchInput('');
        setSearchQuery('');
        setLogLevelFilter('all');
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
    };
    
    // Navigate to previous search match
    const goToPreviousMatch = useCallback(() => {
        if (!searchMatches.length) return;
        
        const newIndex = currentMatchIndex <= 0 ? searchMatches.length - 1 : currentMatchIndex - 1;
        setCurrentMatchIndex(newIndex);
        scrollToMatch(searchMatches[newIndex]);
    }, [currentMatchIndex, searchMatches]);
    
    // Navigate to next search match
    const goToNextMatch = useCallback(() => {
        if (!searchMatches.length) return;
        
        const newIndex = currentMatchIndex >= searchMatches.length - 1 ? 0 : currentMatchIndex + 1;
        setCurrentMatchIndex(newIndex);
        scrollToMatch(searchMatches[newIndex]);
    }, [currentMatchIndex, searchMatches]);
    
    // Scroll to a specific match
    const scrollToMatch = useCallback((lineIndex: number) => {
        if (lineRefs.current[lineIndex]) {
            lineRefs.current[lineIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }, []);
    
    // Effect to scroll to current match when it changes
    useEffect(() => {
        if (currentMatchIndex >= 0 && searchMatches.length > 0) {
            const lineIndex = searchMatches[currentMatchIndex];
            scrollToMatch(lineIndex);
        }
    }, [currentMatchIndex, scrollToMatch]);
    
    // Handle search submission with proper memoization
    const handleSearch = useCallback(() => {
        setSearchQuery(searchInput);
        // Reset search navigation when starting a new search
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
    }, [searchInput]);

    return (
        <Flex vertical gap={8} style={{ ...style }}>
            <Flex gap={8} align='center'>
                <Select
                    value={logLevelFilter}
                    onChange={(value) => setLogLevelFilter(value as LogLevel)}
                    style={{ width: 120 }}
                    options={[
                        { value: 'all', label: 'All Logs' },
                        { value: 'error', label: 'Errors', style: { color: colors.error } },
                        { value: 'warning', label: 'Warnings', style: { color: colors.warning } },
                        { value: 'info', label: 'Info', style: { color: colors.info } },
                        { value: 'success', label: 'Success', style: { color: colors.success } },
                        { value: 'debug', label: 'Debug', style: { color: colors.debug } }
                    ]}
                    suffixIcon={<FilterOutlined />}
                />
                <Flex align="center">
                    <Input.Search
                        placeholder="Search logs"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        onSearch={handleSearch}
                        onPressEnter={handleSearch}
                        style={{ width: 200 }}
                    />
                    {searchMatches.length > 0 && (
                        <Flex align="center" gap={5} style={{ marginLeft: 5 }}>
                            <Button 
                                type="text" 
                                icon={<UpOutlined />} 
                                onClick={goToPreviousMatch} 
                                size="small"
                            />
                            <span style={{ fontSize: '12px' }}>
                                {currentMatchIndex + 1}/{searchMatches.length}
                            </span>
                            <Button 
                                type="text" 
                                icon={<DownOutlined />} 
                                onClick={goToNextMatch} 
                                size="small"
                            />
                        </Flex>
                    )}
                </Flex>
                {(searchQuery || logLevelFilter !== 'all') && (
                    <Tooltip title="Clear filters">
                        <Button 
                            icon={<ClearOutlined />} 
                            onClick={clearFilters} 
                        />
                    </Tooltip>
                )}
            </Flex>
            
            <div
                ref={logContainerRef}
                onScroll={handleScroll}
                style={{
                    borderRadius: '4px',
                    padding: '8px',
                    overflowY: 'auto',
                    border: theme === 'light' ? '1px solid #e0e0e0' : '1px solid #303030',
                }}
            >
            <pre
                style={{
                    color: colors.text,
                    margin: 0,
                    fontFamily: '"Consolas", "Courier New", monospace',
                    fontSize: '14px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                }}
            >
                {isLoading && <div style={{ color: colors.info }}>Loading...</div>}
                
                {/* Load more button at top */}
                {onLoadMore && isAtTop && !isLoading && !searchQuery && (
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '8px 0', 
                        cursor: 'pointer',
                        backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f0f0f0',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        border: theme === 'light' ? '1px dashed #ccc' : '1px dashed #444',
                    }}>
                        <Button 
                            type="link" 
                            onClick={handleLoadMore}
                        >
                            Load more logs...
                        </Button>
                    </div>
                )}
                {!isLoading && !logs && <div>No logs available</div>}
                {!isLoading && logs && processedLogResults.length === 0 && (
                    <div style={{ color: colors.warning, padding: '8px 0' }}>
                        No logs match the current filters
                    </div>
                )}
                {processedLogResults}
            </pre>
        </div>
        </Flex>
    )
};

export default LogsTerminal;