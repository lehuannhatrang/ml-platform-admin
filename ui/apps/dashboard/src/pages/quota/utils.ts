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

import { GPUConfig } from '@/services/dashboard-config';

// Default GPU config if not loaded from backend
export const DEFAULT_GPU_CONFIG: GPUConfig = {
  num_gpus: 1,
  total_vram_gib: 24,
  slice_size_gib: 4,
  default_slices: 1,
};

// Number of GPUs (falls back to 1 if not set)
export const getNumGPUs = (gpuConfig: GPUConfig): number => {
  return gpuConfig.num_gpus || 1;
};

// Slices available on a single GPU
export const getSlicesPerGPU = (gpuConfig: GPUConfig): number => {
  return gpuConfig.total_vram_gib / gpuConfig.slice_size_gib;
};

// Total slices across all GPUs — this is the maximum a user can be assigned
export const getMaxSlices = (gpuConfig: GPUConfig): number => {
  return getNumGPUs(gpuConfig) * getSlicesPerGPU(gpuConfig);
};

// Get default slices from GPU config
export const getDefaultSlices = (gpuConfig: GPUConfig): number => {
  return gpuConfig.default_slices || 1;
};

// Convert slices → GPU fraction (1.0 = one whole GPU)
// With multiple GPUs the result can exceed 1.0
export const slicesToFraction = (slices: number, gpuConfig: GPUConfig): number => {
  return (slices * gpuConfig.slice_size_gib) / gpuConfig.total_vram_gib;
};

// Convert GPU fraction → slices
export const fractionToSlices = (fraction: number, gpuConfig: GPUConfig): number => {
  return (fraction * gpuConfig.total_vram_gib) / gpuConfig.slice_size_gib;
};

// Convert GPU fraction → GiB (uses per-GPU VRAM)
export const fractionToGiB = (fraction: number, gpuConfig: GPUConfig): number => {
  return fraction * gpuConfig.total_vram_gib;
};

// Format GPU fraction as GiB
export const formatGpuAsGiB = (value: number | undefined, gpuConfig: GPUConfig): string => {
  if (value === undefined || value === null) return '-';
  if (value === -1) return 'Unlimited';
  if (value === 0) return '0 GB';
  const gib = fractionToGiB(value, gpuConfig);
  return `${gib.toFixed(1)} GB`;
};

// Format GPU fraction as slices
export const formatAsSlices = (value: number | undefined, gpuConfig: GPUConfig): string => {
  if (value === undefined || value === null) return '-';
  if (value === -1) return 'Unlimited';
  if (value === 0) return '0';
  const slices = fractionToSlices(value, gpuConfig);
  return `${slices.toFixed(1)} slices`;
};

// Format GPU memory from MB to GB
export const formatMemoryGB = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
};

// Get effective limit for percentage calculation
export const getEffectiveLimit = (limit: number | undefined): number => {
  if (limit === undefined || limit === null || limit === 0) return 0;
  if (limit === -1) return 1;
  return limit;
};

