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

import { Progress, Typography } from 'antd';
import { GPUConfig } from '@/services/dashboard-config';
import { QuotaUsage } from '@/services/quota';
import { getEffectiveLimit, fractionToGiB, formatMemoryGB } from '../utils';

const { Text } = Typography;

interface GPUUsageDisplayProps {
  usage?: QuotaUsage;
  limit?: number;
  gpuConfig: GPUConfig;
}

const GPUUsageDisplay = ({ usage, limit, gpuConfig }: GPUUsageDisplayProps) => {
  const effectiveLimit = getEffectiveLimit(limit);
  
  // Calculate the limit in MB for comparison
  const limitVramMB = effectiveLimit > 0 ? fractionToGiB(effectiveLimit, gpuConfig) * 1024 : 0;
  const memoryRequestMB = usage?.gpuMemoryRequest ?? 0;
  
  // Calculate usage percentage based on limit
  let usagePercent = 0;
  if (effectiveLimit > 0) {
    usagePercent = ((usage?.gpuAllocated ?? 0) / effectiveLimit) * 100;
  }
  
  // Check if memory request exceeds limit
  const isOverLimit = limitVramMB > 0 && memoryRequestMB > limitVramMB;
  
  // Determine progress status
  let progressStatus: 'success' | 'normal' | 'exception' | 'active' = 'normal';
  let strokeColor: string | undefined;
  
  if (isOverLimit) {
    strokeColor = '#fa8c16'; // Orange color for over limit
  } else if (usagePercent > 100) {
    progressStatus = 'exception';
  } else if (usagePercent > 80) {
    progressStatus = 'active';
  }

  return (
    <div style={{ minWidth: 180 }}>
      {effectiveLimit > 0 ? (
        <div style={{ marginBottom: 4 }}>
          <Progress 
            percent={Math.min(usagePercent, 100)} 
            size="small" 
            status={strokeColor ? undefined : progressStatus}
            strokeColor={strokeColor}
            format={() => `${usagePercent.toFixed(0)}%`}
            style={{ marginTop: 4 }}
          />
        </div>
      ) : (
        <div style={{ marginBottom: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>No GPU quota set</Text>
        </div>
      )}
      {limitVramMB > 0 && <div>
        <Text 
          type="secondary" 
          style={{ 
            fontSize: 12, 
            color: isOverLimit ? '#fa8c16' : undefined,
            fontWeight: isOverLimit ? 500 : undefined,
          }}
        >
          Memory: {formatMemoryGB(memoryRequestMB)}
          {limitVramMB > 0 && ` / ${formatMemoryGB(limitVramMB)}`}
        </Text>
      </div>}
    </div>
  );
};

export default GPUUsageDisplay;

