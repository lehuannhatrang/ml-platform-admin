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

import { FC, CSSProperties } from 'react';
import styles from './index.module.less';
import DCNLogo from '@/assets/dcn_logo.png';
import {
  setLang,
  getLangIcon,
  getLang,
  supportedLangConfig,
  getLangTitle,
} from '@/utils/i18n';
import { Button, Dropdown, Popconfirm } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';

export interface IUserInfo {
  id: number;
  username: string;
  avatar: string;
}

interface INavigationProps {
  headerStyle?: CSSProperties;
  usePlaceholder?: boolean;
  brandText?: string;
  userInfo?: IUserInfo;
}

const Navigation: FC<INavigationProps> = (props) => {
  const {
    headerStyle = {},
    usePlaceholder = true,
    brandText = 'DCN Dashboard',
    userInfo,
  } = props;
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };
  return (
    <>
      <div className={styles.navbar}>
        <div className={styles.header} style={headerStyle}>
          <div className={styles.left}>
            <div className={styles.brand}>
              <div className={styles.logoWrap}>
                <img className={styles.logo} src={DCNLogo} />
              </div>
              <div className={styles.text}>{brandText}</div>
            </div>
          </div>
          <div className={styles.center}>
            {/* placeholder for center element */}
          </div>
          <div className={styles.right}>
            {/* extra components */}
            <div className={styles.extra}>
              <Dropdown
                menu={{
                  onClick: async (v) => {
                    await setLang(v.key);
                    window.location.reload();
                  },
                  selectedKeys: [getLang()],
                  items: Object.keys(supportedLangConfig).map((lang) => {
                    return {
                      key: lang,
                      label: getLangTitle(lang),
                    };
                  }),
                }}
                placement="bottomLeft"
                arrow
              >
                <div>{getLangIcon(getLang())}</div>
              </Dropdown>
            </div>
            {/* user info */}
            {userInfo && (
              <div className={styles.userWrap}>
                <div className={styles.user}>
                  <img src={userInfo?.avatar} className={styles.avatar} />
                </div>
              </div>
            )}
            {/* logout button */}
            <div className="ml-2">
              <Popconfirm title="Are you sure to logout?" onConfirm={handleLogout}>
                <Button type="text" icon={<LogoutOutlined /> } />
              </Popconfirm>
            </div>
          </div>
        </div>
        {usePlaceholder && <div className={styles.placeholder} />}
      </div>
    </>
  );
};
export default Navigation;
