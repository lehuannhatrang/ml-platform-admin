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

/**
 * Polyfill for crypto API in non-secure contexts
 * Required for Keycloak to work over HTTP (non-localhost)
 */
export function installCryptoPolyfill() {
  // Check if we need the polyfill
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    console.warn('Running in non-secure context. Installing crypto polyfill for development.');

    // Simple UUID v4 generator (not cryptographically secure, but sufficient for development)
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    // Polyfill crypto if it doesn't exist
    if (!window.crypto) {
      (window as any).crypto = {};
    }

    // Polyfill randomUUID if it doesn't exist
    if (!window.crypto.randomUUID) {
      window.crypto.randomUUID = generateUUID;
    }

    // Polyfill getRandomValues if it doesn't exist
    if (!window.crypto.getRandomValues) {
      window.crypto.getRandomValues = (array: any) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      };
    }

    // Polyfill subtle if it doesn't exist
    // We need to provide a stub that throws an error to prevent Keycloak from trying to use PKCE
    if (!window.crypto.subtle) {
      console.warn('crypto.subtle is not available. PKCE will be disabled.');
      // Don't set crypto.subtle at all - let Keycloak detect it's missing
      // This will force Keycloak to not use PKCE
    }
  }
}

