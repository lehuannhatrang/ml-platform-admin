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

import { Terminal } from '@xterm/xterm';

export interface TerminalMessage {
  operation: string;
  data?: string;
  rows?: number;
  cols?: number;
}

export interface TerminalConnectionParams {
  execMode: 'pod' | 'node';
  namespace?: string;
  pod?: string;
  node?: string;
  container?: string;
  cluster?: string;
  shell?: string;
}

export interface TerminalServiceCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: TerminalMessage) => void;
}

export class TerminalService {
  private ws: WebSocket | null = null;
  private terminal: Terminal | null = null;
  private callbacks: TerminalServiceCallbacks = {};

  constructor(terminal: Terminal, callbacks?: TerminalServiceCallbacks) {
    this.terminal = terminal;
    this.callbacks = callbacks || {};
  }

  /**
   * Build WebSocket URL using the same logic as the axios client
   */
  private buildWebSocketURL(params: TerminalConnectionParams): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let pathPrefix = (window as any).__path_prefix__ || '';
    if (!pathPrefix.startsWith('/')) {
      pathPrefix = '/' + pathPrefix;
    }
    if (!pathPrefix.endsWith('/')) {
      pathPrefix = pathPrefix + '/';
    }
    
    const endpoint = params.execMode === 'node' ? 'node-terminal' : 'terminal';
    const wsUrl = new URL(`${protocol}//${window.location.host}${pathPrefix}api/v1/${endpoint}`);
    
    if (params.execMode === 'pod') {
      if (!params.namespace || !params.pod) {
        throw new Error('Namespace and pod are required for pod terminal');
      }
      wsUrl.searchParams.set('namespace', params.namespace);
      wsUrl.searchParams.set('pod', params.pod);
      if (params.container) {
        wsUrl.searchParams.set('container', params.container);
      }
    } else if (params.execMode === 'node') {
      if (!params.node || !params.cluster) {
        throw new Error('Node and cluster are required for node terminal');
      }
      wsUrl.searchParams.set('node', params.node);
    }
    
    if (params.cluster) {
      wsUrl.searchParams.set('cluster', params.cluster);
    }
    if (params.shell) {
      wsUrl.searchParams.set('shell', params.shell);
    }

    return wsUrl.toString();
  }

  /**
   * Connect to the terminal WebSocket
   */
  connect(params: TerminalConnectionParams): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.disconnect();
      }

      if (!this.terminal) {
        reject(new Error('Terminal instance is required'));
        return;
      }

      try {
        const wsUrl = this.buildWebSocketURL(params);
        console.log('Connecting to WebSocket:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connection established');
          this.callbacks.onOpen?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: TerminalMessage = JSON.parse(event.data);
            
            if (message.operation === 'stdout' && message.data && this.terminal) {
              this.terminal.write(message.data);
            }
            
            this.callbacks.onMessage?.(message);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.callbacks.onError?.(error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket connection closed');
          this.callbacks.onClose?.();
        };

        // Set up terminal input handling
        if (this.terminal) {
          this.terminal.onData((data) => {
            this.sendMessage({
              operation: 'stdin',
              data: data
            });
          });

          // Set up terminal resize handling
          this.terminal.onResize(({ cols, rows }) => {
            this.sendMessage({
              operation: 'resize',
              cols: cols,
              rows: rows
            });
          });
        }

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  /**
   * Send a message to the WebSocket
   */
  sendMessage(message: TerminalMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send a resize message
   */
  sendResize(cols: number, rows: number): void {
    this.sendMessage({
      operation: 'resize',
      cols: cols,
      rows: rows
    });
  }

  /**
   * Send stdin data
   */
  sendInput(data: string): void {
    this.sendMessage({
      operation: 'stdin',
      data: data
    });
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if the WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Check if the WebSocket is connecting
   */
  isConnecting(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.CONNECTING;
  }

  /**
   * Get the current WebSocket state
   */
  getState(): number | null {
    return this.ws?.readyState || null;
  }

  /**
   * Update the terminal instance
   */
  setTerminal(terminal: Terminal): void {
    this.terminal = terminal;
  }

  /**
   * Update the callbacks
   */
  setCallbacks(callbacks: TerminalServiceCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.disconnect();
    this.terminal = null;
    this.callbacks = {};
  }
}

/**
 * Create a new terminal service instance
 */
export function createTerminalService(
  terminal: Terminal, 
  callbacks?: TerminalServiceCallbacks
): TerminalService {
  return new TerminalService(terminal, callbacks);
} 