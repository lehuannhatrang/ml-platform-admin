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

import Keycloak from 'keycloak-js';
import { IResponse, karmadaClient } from '@/services/base.ts';

export interface KeycloakConfig {
  enabled: boolean;
  url: string;
  realm: string;
  clientId: string;
  redirectUri: string;
  logoutRedirectUri: string;
}

let keycloakInstance: Keycloak | null = null;
let keycloakConfig: KeycloakConfig | null = null;

/**
 * Fetch Keycloak configuration from the backend
 */
export async function fetchKeycloakConfig(): Promise<KeycloakConfig> {
  const resp = await karmadaClient.get<IResponse<KeycloakConfig>>(
    '/keycloak/config',
  );
  keycloakConfig = resp.data.data;
  return keycloakConfig;
}

/**
 * Get the cached Keycloak configuration
 */
export function getKeycloakConfig(): KeycloakConfig | null {
  return keycloakConfig;
}

/**
 * Initialize Keycloak instance
 */
export async function initKeycloak(): Promise<Keycloak | null> {
  try {
    const config = await fetchKeycloakConfig();

    if (!config.enabled) {
      console.log('Keycloak is not enabled');
      return null;
    }

    keycloakInstance = new Keycloak({
      url: config.url,
      realm: config.realm,
      clientId: config.clientId,
    });

    return keycloakInstance;
  } catch (error) {
    console.error('Failed to initialize Keycloak:', error);
    return null;
  }
}

/**
 * Get the Keycloak instance
 */
export function getKeycloak(): Keycloak | null {
  return keycloakInstance;
}

/**
 * Login with Keycloak
 */
export async function loginWithKeycloak(): Promise<void> {
  if (!keycloakInstance) {
    throw new Error('Keycloak not initialized');
  }

  const config = getKeycloakConfig();
  if (!config) {
    throw new Error('Keycloak configuration not available');
  }

  try {
    // Check if we're in a secure context
    const isSecureContext = window.isSecureContext || window.location.hostname === 'localhost';
    
    if (!isSecureContext) {
      // For non-secure contexts, manually redirect to Keycloak without PKCE
      // This bypasses the keycloak-js library's PKCE generation
      const state = generateRandomString(32);
      const nonce = generateRandomString(32);
      
      // Store state for validation on callback
      sessionStorage.setItem('keycloak-state', state);
      sessionStorage.setItem('keycloak-nonce', nonce);
      
      // Build login URL manually for implicit flow
      const loginUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/auth?` +
        `client_id=${encodeURIComponent(config.clientId)}&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
        `state=${encodeURIComponent(state)}&` +
        `nonce=${encodeURIComponent(nonce)}&` +
        `response_mode=fragment&` +
        `response_type=token id_token&` +
        `scope=openid`;
      
      console.log('Redirecting to Keycloak (implicit flow):', loginUrl);
      window.location.href = loginUrl;
    } else {
      // For secure contexts, use the standard keycloak-js method with PKCE
      await keycloakInstance.login({
        redirectUri: config.redirectUri,
      });
    }
  } catch (error) {
    console.error('Keycloak login error:', error);
    throw error;
  }
}

/**
 * Generate a random string for state/nonce
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const values = window.crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

/**
 * Logout with Keycloak
 */
export async function logoutWithKeycloak(): Promise<void> {
  if (!keycloakInstance) {
    throw new Error('Keycloak not initialized');
  }

  const config = getKeycloakConfig();
  if (!config) {
    throw new Error('Keycloak configuration not available');
  }

  await keycloakInstance.logout({
    redirectUri: config.logoutRedirectUri,
  });
}

/**
 * Get the Keycloak access token
 */
export function getKeycloakToken(): string | undefined {
  return keycloakInstance?.token;
}

/**
 * Check if the user is authenticated with Keycloak
 */
export function isKeycloakAuthenticated(): boolean {
  return keycloakInstance?.authenticated ?? false;
}

/**
 * Refresh the Keycloak token
 */
export async function refreshKeycloakToken(): Promise<boolean> {
  if (!keycloakInstance) {
    return false;
  }

  try {
    const refreshed = await keycloakInstance.updateToken(30);
    return refreshed;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return false;
  }
}

/**
 * Get user info from Keycloak token
 */
export async function getKeycloakUserInfo() {
  if (!keycloakInstance || !keycloakInstance.authenticated) {
    return null;
  }

  try {
    const userInfo = await keycloakInstance.loadUserInfo();
    return userInfo;
  } catch (error) {
    console.error('Failed to load user info:', error);
    return null;
  }
}

/**
 * Check if user has a specific role
 */
export function hasKeycloakRole(role: string): boolean {
  if (!keycloakInstance || !keycloakInstance.authenticated) {
    return false;
  }

  return keycloakInstance.hasRealmRole(role) || keycloakInstance.hasResourceRole(role);
}

/**
 * Check if user is admin
 */
export function isKeycloakAdmin(): boolean {
  return hasKeycloakRole('admin') || hasKeycloakRole('dashboard-admin');
}

