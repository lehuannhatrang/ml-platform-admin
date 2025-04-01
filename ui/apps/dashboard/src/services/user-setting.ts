import { IResponse, karmadaClient } from './base';

export interface UserSetting {
  username: string;
  displayName?: string;
  password?: string; // Added for user creation
  theme?: string;
  language?: string;
  dateFormat?: string;
  timeFormat?: string;
  preferences?: {
    role?: 'Administrator' | 'Basic User';
    [key: string]: string | undefined;
  };
  dashboard?: {
    defaultView?: string;
    refreshInterval?: number;
    pinnedClusters?: string[];
    hiddenWidgets?: string[];
    widgetLayout?: Record<string, {
      row: number;
      column: number;
      width: number;
      height: number;
    }>;
  };
}

/**
 * Get current user's settings
 */
export const getUserSetting = async () => {
  const resp = await karmadaClient.get<IResponse<UserSetting>>('/setting/user');
  return resp.data;
};

/**
 * Get all users' settings (admin only)
 */
export const getAllUserSettings = async () => {
  const resp = await karmadaClient.get<IResponse<UserSetting[]>>('/setting/users');
  return resp.data;
};

/**
 * Create user settings
 */
export const createUserSetting = async (data: UserSetting) => {
  const resp = await karmadaClient.post<IResponse<UserSetting>>('/setting/user', data);
  return resp.data;
};

/**
 * Update user settings
 */
export const updateUserSetting = async (data: UserSetting) => {
  const resp = await karmadaClient.put<IResponse<UserSetting>>('/setting/user', data);
  return resp.data;
};

/**
 * Delete user settings
 */
export const deleteUserSetting = async (username: string) => {
  const resp = await karmadaClient.delete<IResponse<void>>(`/setting/user/${username}`);
  return resp.data;
};
