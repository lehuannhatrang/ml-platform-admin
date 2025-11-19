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

import { FC } from 'react';

interface CloudProvider {
  value: string;
  name: string;
  color: string;
  bgColor: string;
}

const cloudProviders: CloudProvider[] = [
  { value: 'aws', name: 'AWS', color: '#FF9900', bgColor: '#FFF4E6' },
  { value: 'gcp', name: 'Google Cloud', color: '#4285F4', bgColor: '#E8F4FD' },
  { value: 'azure', name: 'Microsoft Azure', color: '#0078D4', bgColor: '#E6F2FF' },
  { value: 'openstack', name: 'OpenStack', color: '#DA1A32', bgColor: '#FFE6E9' },
//   { value: 'vsphere', name: 'VMware vSphere', color: '#00AB4E', bgColor: '#E6F7EF' },
];

interface CloudProviderSelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

const CloudProviderSelector: FC<CloudProviderSelectorProps> = ({ value, onChange, disabled }) => {
  const handleSelect = (providerValue: string) => {
    if (!disabled && onChange) {
      onChange(providerValue);
    }
  };

  const getProviderLogo = (providerValue: string) => {
    const logoMap: Record<string, string> = {
      aws: '/cloud-provider/aws.png',
      gcp: '/cloud-provider/gcp.svg',
      azure: '/cloud-provider/azure.png',
      openstack: '/cloud-provider/openstack.png',
      vsphere: '', // No logo yet
    };
    return logoMap[providerValue] || '';
  };

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      {cloudProviders.map((provider) => {
        const isSelected = value === provider.value;
        const logoPath = getProviderLogo(provider.value);
        
        return (
          <div
            key={provider.value}
            onClick={() => handleSelect(provider.value)}
            style={{
              width: '140px',
              height: '100px',
              border: isSelected ? `2px solid ${provider.color}` : '2px solid #d9d9d9',
              borderRadius: '8px',
              backgroundColor: isSelected ? provider.bgColor : disabled ? '#f5f5f5' : '#fafafa',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              position: 'relative',
              boxShadow: isSelected ? `0 4px 12px ${provider.color}40` : '0 2px 4px rgba(0,0,0,0.05)',
              opacity: disabled ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSelected && !disabled) {
                e.currentTarget.style.borderColor = provider.color;
                e.currentTarget.style.backgroundColor = provider.bgColor;
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected && !disabled) {
                e.currentTarget.style.borderColor = '#d9d9d9';
                e.currentTarget.style.backgroundColor = '#fafafa';
              }
            }}
          >
            {isSelected && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: provider.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                ✓
              </div>
            )}
            <div
              style={{
                width: '48px',
                height: '48px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {logoPath ? (
                <img
                  src={logoPath}
                  alt={provider.name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: provider.color,
                  }}
                >
                  ◆
                </div>
              )}
            </div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: isSelected ? '600' : '500',
                color: isSelected ? provider.color : '#595959',
                textAlign: 'center',
                padding: '0 8px',
              }}
            >
              {provider.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CloudProviderSelector;




