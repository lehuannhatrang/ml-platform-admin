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

import React, { useState, useEffect } from 'react';
import { Input, Typography, Alert } from 'antd';

const { Text } = Typography;

interface CronInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

const CronInput: React.FC<CronInputProps> = ({ value, onChange, placeholder }) => {
  const [cronExpression, setCronExpression] = useState(value || '');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (value !== undefined) {
      setCronExpression(value);
    }
  }, [value]);

  const parseCronExpression = (cron: string): string => {
    if (!cron || !cron.trim()) return '';
    
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      setError('Cron expression must have exactly 5 fields');
      return '';
    }

    setError('');

    try {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
      
      // Simple pattern matching for common expressions
      if (cron === '0 * * * *') return 'Every hour';
      if (cron === '0 0 * * *') return 'Daily at midnight';
      if (cron === '0 0 * * 0') return 'Weekly on Sunday at midnight';
      if (cron === '0 0 1 * *') return 'Monthly on the 1st at midnight';
      if (cron === '*/5 * * * *') return 'Every 5 minutes';
      if (cron === '*/15 * * * *') return 'Every 15 minutes';
      if (cron === '*/30 * * * *') return 'Every 30 minutes';
      if (cron === '0 2 * * *') return 'Daily at 2:00 AM';
      if (cron === '0 0 * * 1') return 'Weekly on Monday at midnight';
      
      // Build description from parts
      let desc = 'Runs ';
      
      // Minute
      if (minute === '*') {
        desc += 'every minute';
      } else if (minute.startsWith('*/')) {
        desc += `every ${minute.slice(2)} minutes`;
      } else {
        desc += `at minute ${minute}`;
      }
      
      // Hour
      if (hour === '*') {
        desc += ' of every hour';
      } else if (hour.startsWith('*/')) {
        desc += ` of every ${hour.slice(2)} hours`;
      } else {
        desc += ` of hour ${hour}`;
      }
      
      // Day of month
      if (dayOfMonth !== '*') {
        if (dayOfMonth.startsWith('*/')) {
          desc += ` every ${dayOfMonth.slice(2)} days`;
        } else {
          desc += ` on day ${dayOfMonth}`;
        }
      }
      
      // Month
      if (month !== '*') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (month.startsWith('*/')) {
          desc += ` every ${month.slice(2)} months`;
        } else {
          const monthNum = parseInt(month) - 1;
          if (monthNum >= 0 && monthNum < 12) {
            desc += ` in ${months[monthNum]}`;
          }
        }
      }
      
      // Day of week
      if (dayOfWeek !== '*') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        if (dayOfWeek.startsWith('*/')) {
          desc += ` every ${dayOfWeek.slice(2)} days of the week`;
        } else {
          const dayNum = parseInt(dayOfWeek);
          if (dayNum >= 0 && dayNum <= 6) {
            desc += ` on ${days[dayNum]}`;
          }
        }
      }
      
      return desc;
    } catch (e) {
      setError('Invalid cron expression');
      return '';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setCronExpression(newValue);
    
    const desc = parseCronExpression(newValue);
    setDescription(desc);
    
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      <Input
        value={cronExpression}
        onChange={handleChange}
        placeholder={placeholder || "e.g., 0 2 * * * (daily at 2 AM)"}
        className={error ? 'border-red-500' : ''}
      />
      
      {error && (
        <Alert message={error} type="error" />
      )}
      
      {description && !error && (
        <Text type="secondary" className="text-sm">
          {description}
        </Text>
      )}
      
      <div className="text-xs text-gray-500">
        <div>Cron format: minute hour day-of-month month day-of-week</div>
        <div>Examples:</div>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li><code>0 2 * * *</code> - Daily at 2:00 AM</li>
          <li><code>*/15 * * * *</code> - Every 15 minutes</li>
          <li><code>0 0 * * 0</code> - Weekly on Sunday at midnight</li>
          <li><code>0 0 1 * *</code> - Monthly on the 1st at midnight</li>
        </ul>
      </div>
    </div>
  );
};

export default CronInput;



