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

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import Keycloak from 'keycloak-js';
import {
  initKeycloak,
  getKeycloak,
  getKeycloakConfig,
  KeycloakConfig,
} from '@/services/keycloak';
import { installCryptoPolyfill } from '@/utils/crypto-polyfill';

interface KeycloakContextType {
  keycloak: Keycloak | null;
  config: KeycloakConfig | null;
  initialized: boolean;
  authenticated: boolean;
}

const KeycloakContext = createContext<KeycloakContextType>({
  keycloak: null,
  config: null,
  initialized: false,
  authenticated: false,
});

export const KeycloakProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [config, setConfig] = useState<KeycloakConfig | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Install crypto polyfill for non-secure contexts
        installCryptoPolyfill();
        
        const kc = await initKeycloak();
        const cfg = getKeycloakConfig();
        
        setConfig(cfg);

        if (!cfg?.enabled || !kc) {
          // Keycloak not enabled, mark as initialized without authentication
          setInitialized(true);
          return;
        }

        // Check if we're on the callback page with implicit flow token
        const isCallbackPage = window.location.pathname === '/callback';
        const hasImplicitToken = window.location.hash.includes('access_token=');
        
        if (isCallbackPage && hasImplicitToken) {
          // Skip Keycloak initialization for implicit flow callbacks
          // The callback page will handle the token directly
          console.log('Implicit flow callback detected, skipping Keycloak init');
          setKeycloak(kc); // Set the instance but don't initialize
          setInitialized(true);
          return;
        }

        // Initialize Keycloak with the config
        // PKCE is only available in secure contexts (HTTPS or localhost)
        const isSecureContext = window.isSecureContext || window.location.hostname === 'localhost';
        console.log('isSecureContext', isSecureContext);
        
        // For non-secure contexts, we need to use implicit flow which doesn't require PKCE
        const initConfig: any = {
          onLoad: 'check-sso',
          checkLoginIframe: false,
        };
        
        if (isSecureContext) {
          // Use standard flow with PKCE for secure contexts (most secure)
          initConfig.flow = 'standard';
          initConfig.pkceMethod = 'S256';
          initConfig.silentCheckSsoRedirectUri = window.location.origin + '/silent-check-sso.html';
        } else {
          // For non-secure contexts, use implicit flow (no PKCE required)
          // Note: Implicit flow is less secure but necessary for HTTP without localhost
          console.warn('Using implicit flow for non-secure context. Consider using HTTPS in production.');
          initConfig.flow = 'implicit';
          // Implicit flow doesn't support PKCE
        }
        
        const auth = await kc.init(initConfig);

        setKeycloak(kc);
        setAuthenticated(auth);
        setInitialized(true);

        // Set up token refresh
        if (auth) {
          setInterval(() => {
            kc.updateToken(30)
              .then((refreshed) => {
                if (refreshed) {
                  console.log('Token refreshed');
                }
              })
              .catch(() => {
                console.error('Failed to refresh token');
              });
          }, 60000); // Check every minute
        }
      } catch (error) {
        console.error('Failed to initialize Keycloak:', error);
        setInitialized(true); // Mark as initialized even on error
      }
    };

    initialize();
  }, []);

  return (
    <KeycloakContext.Provider
      value={{ keycloak, config, initialized, authenticated }}
    >
      {children}
    </KeycloakContext.Provider>
  );
};

export const useKeycloak = () => {
  const context = useContext(KeycloakContext);
  if (!context) {
    throw new Error('useKeycloak must be used within KeycloakProvider');
  }
  return context;
};

