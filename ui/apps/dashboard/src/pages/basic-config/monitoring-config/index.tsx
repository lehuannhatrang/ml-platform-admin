import Panel from '@/components/panel';
import { DeleteMonitoringSource, GetMonitoringConfig, MonitoringType } from '@/services/monitoring-config';
import { useQuery } from '@tanstack/react-query';
import { FC, useState } from 'react';
import { Spin, Typography, Row, Col, Card, Flex, Popconfirm, message } from 'antd';
import GrafanaLogo from '@/assets/grafana-logo.png';
import { DeleteOutlined, EditOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons';
import MonitoringConfigModal from './edit-monitoring-config-modal';
import i18nInstance from '@/utils/i18n';

const MonitoringConfig: FC = () => {
    const [monitoringConfigDrawer, setMonitoringConfigDrawer] = useState<{
        mode: 'create' | 'edit';
        open: boolean;
        name: string;
        endpoint: string;
        token: string;
        type: MonitoringType;
    }>({
        mode: 'create',
        open: false,
        name: '',
        endpoint: '',
        token: '',
        type: MonitoringType.GRAFANA,
    });
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['get-monitoring-config'],
        queryFn: async () => {
            const resp = await GetMonitoringConfig()
            return resp.data
        },
    });
    return (
        <Panel showSelectCluster={false}>
            <Spin spinning={isLoading}>
                <Typography.Title level={3}>Monitoring Sources</Typography.Title>
                <Row gutter={32}>
                    <Col span={6} key="add">
                        <Card
                            className='flex border-dotted'
                            style={{
                                height: "100%"
                            }}
                            hoverable={true}
                            onClick={() => setMonitoringConfigDrawer({
                                mode: 'create',
                                open: true,
                                name: '',
                                endpoint: '',
                                token: '',
                                type: MonitoringType.GRAFANA,
                            })}

                        >
                            <Flex
                                justify="center"
                                align="center"
                                className="h-[100%] text-blue-500"
                            >
                                <PlusOutlined />
                                <Typography.Text className='ml-2 text-lg text-blue-500'>
                                    New source
                                </Typography.Text>
                            </Flex>
                        </Card>
                    </Col>
                    {data?.monitorings?.map((item) => (
                        <Col span={6} key={item.name}>
                            <Card
                                cover={<img alt="my-grafana" src={GrafanaLogo} className='p-[16px]' />}
                                actions={[
                                    <EditOutlined key="edit" onClick={() => setMonitoringConfigDrawer({
                                        mode: 'edit',
                                        open: true,
                                        name: item.name,
                                        endpoint: item.endpoint,
                                        token: item.token,
                                        type: item.type,
                                    })} />,
                                    <ExportOutlined key="new-tab" onClick={() => window.open(item.endpoint, '_blank')} />,
                                    <Popconfirm
                                        placement="topRight"
                                        title={`Do you want to delete "${item.name}" source?`}
                                        onConfirm={async () => {
                                            //TODO
                                            const resp = await DeleteMonitoringSource({
                                                name: item.name,
                                                endpoint: item.endpoint,
                                            })
                                            if(resp.code === 200) {
                                                message.success('Delete monitoring source successfully')
                                                refetch()
                                            }
                                        }}
                                        okText={i18nInstance.t(
                                            'e83a256e4f5bb4ff8b3d804b5473217a',
                                            '确认',
                                        )}
                                        cancelText={i18nInstance.t(
                                            '625fb26b4b3340f7872b411f401e754c',
                                            '取消',
                                        )}
                                    >
                                        <DeleteOutlined key="delete" />
                                    </Popconfirm>
                                ]}
                            >
                                <Card.Meta title={item.name} description={`Endpoint: ${item.endpoint}`} />
                            </Card>
                        </Col>
                    ))}
                </Row>
            </Spin>
            <MonitoringConfigModal
                mode={monitoringConfigDrawer.mode}
                open={monitoringConfigDrawer.open}
                onCancel={() => setMonitoringConfigDrawer({
                    mode: 'create',
                    open: false,
                    name: '',
                    endpoint: '',
                    token: '',
                    type: MonitoringType.GRAFANA,
                })}
                name={monitoringConfigDrawer.name}
                endpoint={monitoringConfigDrawer.endpoint}
                token={monitoringConfigDrawer.token}
                type={monitoringConfigDrawer.type}
                onOk={async () => {
                    await refetch();
                    setMonitoringConfigDrawer({
                        mode: 'create',
                        open: false,
                        name: '',
                        endpoint: '',
                        token: '',
                        type: MonitoringType.GRAFANA,
                    })
                }}
            />
        </Panel>
    )
};

export default MonitoringConfig;