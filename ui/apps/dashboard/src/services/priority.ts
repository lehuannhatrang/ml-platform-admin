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

import { IResponse, karmadaClient } from './base';

export interface PriorityAssignment {
  profile: string;
  priorityClass: string;
  username?: string;
  email?: string;
}

export interface PriorityListResponse {
  assignments: PriorityAssignment[];
  total: number;
}

export interface PriorityAssignmentRequest {
  profile: string;
  priorityClass: string;
}

/**
 * Get all priority assignments
 */
export async function GetPriorities() {
  return karmadaClient.get<IResponse<PriorityListResponse>>('/priority');
}

/**
 * Get priority for a specific profile
 */
export async function GetPriority(profile: string) {
  return karmadaClient.get<IResponse<PriorityAssignment>>(`/priority/${profile}`);
}

/**
 * Set or update priority for a profile
 */
export async function SetPriority(data: PriorityAssignmentRequest) {
  return karmadaClient.post<IResponse<PriorityAssignment>>('/priority', data);
}

/**
 * Update priority for a specific profile
 */
export async function UpdatePriority(profile: string, priorityClass: string) {
  return karmadaClient.put<IResponse<PriorityAssignment>>(`/priority/${profile}`, {
    profile,
    priorityClass,
  });
}

/**
 * Delete priority assignment for a profile
 */
export async function DeletePriority(profile: string) {
  return karmadaClient.delete<IResponse<{ message: string }>>(`/priority/${profile}`);
}

