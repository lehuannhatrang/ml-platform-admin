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

import { karmadaClient } from './base';

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  emailVerified: boolean;
  roles: string[];
  createdTimestamp: number;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password: string;
  enabled: boolean;
  emailVerified: boolean;
  roles?: string[];
}

export interface UpdateUserRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  roles?: string[];
}

export interface UpdatePasswordRequest {
  password: string;
}

export interface UsersResponse {
  code: number;
  message: string;
  data: User[];
}

export interface UserResponse {
  code: number;
  message: string;
  data: User;
}

export interface CreateUserResponse {
  code: number;
  message: string;
  data: {
    id: string;
  };
}

export interface RolesResponse {
  code: number;
  message: string;
  data: string[];
}

export interface BaseResponse {
  code: number;
  message: string;
  data: any;
}

/**
 * Get all users from Keycloak
 */
export async function GetUsers(): Promise<UsersResponse> {
  const response = await karmadaClient.get('/users');
  return response.data;
}

/**
 * Get a specific user by ID
 */
export async function GetUser(id: string): Promise<UserResponse> {
  const response = await karmadaClient.get(`/users/${id}`);
  return response.data;
}

/**
 * Create a new user in Keycloak
 */
export async function CreateUser(request: CreateUserRequest): Promise<CreateUserResponse> {
  const response = await karmadaClient.post('/users', request);
  return response.data;
}

/**
 * Update an existing user in Keycloak
 */
export async function UpdateUser(id: string, request: UpdateUserRequest): Promise<BaseResponse> {
  const response = await karmadaClient.put(`/users/${id}`, request);
  return response.data;
}

/**
 * Update a user's password
 */
export async function UpdateUserPassword(id: string, request: UpdatePasswordRequest): Promise<BaseResponse> {
  const response = await karmadaClient.put(`/users/${id}/password`, request);
  return response.data;
}

/**
 * Delete a user from Keycloak
 */
export async function DeleteUser(id: string): Promise<BaseResponse> {
  const response = await karmadaClient.delete(`/users/${id}`);
  return response.data;
}

/**
 * Get all available roles in the realm
 */
export async function GetRoles(): Promise<RolesResponse> {
  const response = await karmadaClient.get('/roles');
  return response.data;
}

