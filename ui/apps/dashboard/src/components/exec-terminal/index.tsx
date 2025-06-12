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

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Button, Select, message, Space, Card } from 'antd';
import { useTheme } from '@/contexts/theme-context';
import { 
  TerminalService, 
  createTerminalService, 
  TerminalConnectionParams,
  TerminalServiceCallbacks,
} from '@/services/terminal';

const { Option } = Select;

interface ExecTerminalProps {
  execMode: 'pod' | 'node'; // 'pod' for existing pod terminal, 'node' for new node terminal
  namespace?: string; // Optional for node mode
  pod?: string; // Optional for node mode
  node?: string; // For node mode
  containers?: string[];
  cluster?: string;
  style?: React.CSSProperties;
  onClose?: () => void;
}

export default function ExecTerminal({ 
  execMode,
  namespace, 
  pod, 
  node,
  containers = [], 
  cluster, 
  style, 
}: ExecTerminalProps) {
  const { theme } = useTheme();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState(containers[0] || '');
  const [selectedShell, setSelectedShell] = useState('/bin/bash');
  const [showControls, setShowControls] = useState(true);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const terminalServiceRef = useRef<TerminalService | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Update selected container when containers prop changes
  useEffect(() => {
    if (containers.length > 0 && !containers.includes(selectedContainer)) {
      setSelectedContainer(containers[0]);
    }
  }, [containers, selectedContainer]);

  // Effect to initialize the terminal instance
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create new terminal instance with theme-aware colors
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      theme: {
        background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
        foreground: theme === 'dark' ? '#d4d4d4' : '#333333',
        cursor: theme === 'dark' ? '#ffffff' : '#333333',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      allowTransparency: false,
      drawBoldTextInBrightColors: true,
      rightClickSelectsWord: true,
      macOptionIsMeta: true,
    });

    // Add fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in DOM element
    terminal.open(terminalRef.current);
    
    // Fit terminal to container
    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    // Store references
    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;
    terminalServiceRef.current = createTerminalService(terminal, {});

    // Handle terminal resize
    const handleResize = () => {
      if (fitAddonRef.current && terminalServiceRef.current?.isConnected()) {
        fitAddon.fit();
      }
    };
    window.addEventListener('resize', handleResize);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      terminalServiceRef.current?.destroy();
      terminal.dispose();
    };
  }, [theme]);

  const connect = async () => {
    if (execMode === 'pod' && !selectedContainer) {
      message.error('Please select a container');
      return;
    }

    if (execMode === 'node' && !node) {
      message.error('Node name is required for node terminal');
      return;
    }

    setIsConnecting(true);
    
    // Ensure terminal is initialized
    if (!terminalInstanceRef.current) {
      // Create new terminal instance with theme-aware colors
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        theme: {
          background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
          foreground: theme === 'dark' ? '#d4d4d4' : '#333333',
          cursor: theme === 'dark' ? '#ffffff' : '#333333',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        },
        allowTransparency: false,
        drawBoldTextInBrightColors: true,
        rightClickSelectsWord: true,
        macOptionIsMeta: true,
      });

      // Add fit addon
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Open terminal in DOM element
      if (terminalRef.current) {
        terminal.open(terminalRef.current);
      }
      
      // Fit terminal to container
      setTimeout(() => {
        fitAddon.fit();
      }, 100);

      // Store references
      terminalInstanceRef.current = terminal;
      fitAddonRef.current = fitAddon;

      const handleResize = () => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      };
      window.addEventListener('resize', handleResize);
    }
    
    if (!terminalInstanceRef.current) {
      message.error('Failed to initialize terminal');
      setIsConnecting(false);
      return;
    }

    const terminal = terminalInstanceRef.current;

    const callbacks: TerminalServiceCallbacks = {
      onOpen: () => {
        setIsConnected(true);
        setIsConnecting(false);
        setShowControls(false);
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      },
      onClose: () => {
        setIsConnected(false);
        setIsConnecting(false);
        setShowControls(true);
      },
      onError: (error) => {
        console.error('WebSocket error:', error);
        terminal.writeln('\x1b[31mWebSocket connection error\x1b[0m');
        setIsConnected(false);
        setIsConnecting(false);
        setShowControls(true);
        message.error('Failed to connect to terminal');
      }
    };
    
    const terminalService = createTerminalService(terminal, callbacks);
    terminalServiceRef.current = terminalService;
    
    const params: TerminalConnectionParams = {
      execMode,
      namespace,
      pod,
      container: selectedContainer,
      node,
      shell: selectedShell,
      cluster,
    };
    
    try {
      await terminalService.connect(params);
    } catch (error) {
      console.error('Connection error:', error);
      message.error('Failed to connect to terminal');
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (terminalServiceRef.current) {
      terminalServiceRef.current.disconnect();
    }
    setIsConnected(false);
    setShowControls(true);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (terminalServiceRef.current) {
        terminalServiceRef.current.destroy();
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
      }
    };
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', ...style }}>
      {showControls && (
        <Card 
          size="small" 
          style={{ marginBottom: 8 }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <Space wrap>
            {execMode === 'pod' && (
              <Select
                value={selectedContainer}
                onChange={setSelectedContainer}
                style={{ minWidth: 200 }}
                placeholder="Select a container"
                disabled={isConnecting}
              >
                {containers.map((c) => (
                  <Option key={c} value={c}>{c}</Option>
                ))}
              </Select>
            )}
            <Select
              value={selectedShell}
              onChange={setSelectedShell}
              style={{ width: 150 }}
              disabled={isConnecting}
            >
              <Option value="/bin/bash">bash</Option>
              <Option value="/bin/sh">sh</Option>
            </Select>

            <Button
              type="primary"
              onClick={connect}
              loading={isConnecting}
              disabled={isConnected}
            >
              Connect
            </Button>
            {isConnected && (
              <Button onClick={disconnect} danger>
                Disconnect
              </Button>
            )}
          </Space>
        </Card>
      )}

      <div 
        ref={terminalRef} 
        style={{ 
          flex: 1, 
          width: '100%',
          height: '100%',
          backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
          padding: '10px',
        }}
      />
    </div>
  );
} 