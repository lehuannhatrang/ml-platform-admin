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
import { Drawer } from 'antd';
import { WorkloadKind } from '@/services/base.ts';
import ExecTerminal from '@/components/exec-terminal';

export interface ExecDrawerProps {
    open: boolean;
    kind: WorkloadKind;
    namespace: string;
    name: string;
    cluster: string;
    onClose: () => void;
    containers: string[];
}

const ExecDrawer: FC<ExecDrawerProps> = (props) => {
    const { open, namespace, name, onClose, cluster, containers } = props;

    return (
        <Drawer
            title={`Terminal: ${name}`}
            placement="bottom"
            open={open}
            height="100vh"
            onClose={onClose}
            bodyStyle={{ padding: 0 }}
        >
            {open && (
                <ExecTerminal
                    execMode="pod"
                    namespace={namespace}
                    pod={name}
                    containers={containers}
                    cluster={cluster}
                    style={{ height: '100%' }}
                    onClose={onClose}
                />
            )}
        </Drawer>
    );
};

export default ExecDrawer; 