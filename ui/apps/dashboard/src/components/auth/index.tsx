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
} from 'react';
import { Me, USER_ROLE } from '@/services/auth.ts';
import { karmadaClient } from '@/services';
import { useQuery } from '@tanstack/react-query';

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
  const [token, setToken_] = useState(localStorage.getItem('token'));
  const setToken = useCallback((newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken_(newToken);
  }, []);
  const { data, isLoading } = useQuery({
    queryKey: ['Me', token],
    queryFn: async () => {
      if (token) {
        karmadaClient.defaults.headers.common[
          'Authorization'
        ] = `Bearer ${token}`;
        const ret = await Me();
        return ret.data;
      } else {
        return {
          authenticated: false,
          initToken: false,
          role: undefined,
        };
      }
    },
  });
  const ctxValue = useMemo(() => {
    if (data && token) {
      return {
        authenticated: !!data.authenticated,
        initToken: data.initToken,
        token,
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
  }, [data, token, setToken]);
  return (
    <AuthContext.Provider value={ctxValue}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export default AuthProvider;
