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

import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { Me, USER_ROLE } from '@/services/auth.ts';
import { karmadaClient } from '@/services';
import { useQuery } from '@tanstack/react-query';
import { useKeycloak } from '@/contexts/keycloak-context';

const AuthContext = createContext<{
  authenticated: boolean;
  initToken: boolean;
  token: string;
  role?: USER_ROLE;
  setToken: (v: string) => void;
}>({
  authenticated: false,
  initToken: false,
  token: '',
  role: undefined,
  setToken: () => {},
});

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { keycloak, authenticated: keycloakAuthenticated, initialized: keycloakInitialized } = useKeycloak();
  const [token, setToken_] = useState(localStorage.getItem('token'));
  
  const setToken = useCallback((newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken_(newToken);
  }, []);

  // Use Keycloak token if available
  useEffect(() => {
    if (keycloak?.authenticated && keycloak.token) {
      setToken_(keycloak.token);
      karmadaClient.defaults.headers.common['Authorization'] = `Bearer ${keycloak.token}`;
    }
  }, [keycloak?.authenticated, keycloak?.token]);

  const { data, isLoading } = useQuery({
    queryKey: ['Me', token, keycloakAuthenticated],
    queryFn: async () => {
      const effectiveToken = keycloak?.token || token;
      
      if (effectiveToken) {
        karmadaClient.defaults.headers.common[
          'Authorization'
        ] = `Bearer ${effectiveToken}`;
        
        try {
          const ret = await Me();
          return ret.data;
        } catch (error) {
          console.error('Failed to fetch user info:', error);
          return {
            authenticated: false,
            initToken: false,
            role: undefined,
          };
        }
      } else {
        return {
          authenticated: false,
          initToken: false,
          role: undefined,
        };
      }
    },
    enabled: keycloakInitialized, // Only run query after Keycloak is initialized
  });

  const ctxValue = useMemo(() => {
    const effectiveToken = keycloak?.token || token;
    const isAuthenticated = keycloakAuthenticated || (data?.authenticated && !!effectiveToken);
    
    if (isAuthenticated && effectiveToken) {
      return {
        authenticated: true,
        initToken: data?.initToken ?? true, // Keycloak doesn't need init token
        token: effectiveToken,
        role: data?.role,
        setToken,
      };
    } else {
      return {
        authenticated: false,
        initToken: false,
        token: '',
        setToken,
        role: undefined,
      };
    }
  }, [data, token, setToken, keycloak?.token, keycloakAuthenticated]);

  const loading = !keycloakInitialized || isLoading;

  return (
    <AuthContext.Provider value={ctxValue}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export default AuthProvider;
