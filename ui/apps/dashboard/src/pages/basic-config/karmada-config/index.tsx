import { useEffect, useState } from 'react';
import { Layout, Menu, Row, Col, Card, Spin } from 'antd';
import { GetRunningPods, GetPodDetails, GetPodLogs, PodState } from '@/services';
import KarmadaHeader from './header';
import TerminalLogs from './TerminalLogs';
import dayjs from 'dayjs';
import Panel from '@/components/panel';

const { Sider, Content } = Layout;

const Label = ({ text }: { text: string }) => <strong>{text}:</strong>;

const Children = ({ content }: { content: string }) => <p>{content}</p>;


const KarmadaConfigPage = () => {
  const [state, setState] = useState<PodState>({
    pods: [],
    selectedPodDetails: null,
    podLogs: {},
    activeTab: '1',
    podCount: 0,
    podNames: []
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await GetRunningPods();
        setState(prev => ({
          ...prev,
          pods: data.appLabels,
          podNames: data.appLabels.length > 0 ? data.appLabels : []
        }));
        if (data.appLabels.length > 0) {
          handlePodClick(data.appLabels[0]);
        }
      } catch (error) {
        console.error('Error fetching running pods:', error);
      }
    };
    fetchData();
  }, []);

  const handlePodClick = async (podName: string) => {
    try {
      setIsLoading(true);
      const data = await GetPodDetails(podName);
      const logsPromises = data.pods.map(async (pod: { name: string }) => {
        const logData = await GetPodLogs(pod.name);
        return { name: pod.name, log: logData.logs };
      });

      const logsArray = await Promise.all(logsPromises);
      const logs = logsArray.reduce((acc: Record<string, string>, { name, log }) => {
        acc[name] = log;
        return acc;
      }, {});

      setState(prev => ({
        ...prev,
        selectedPodDetails: data.pods[0],
        podCount: data.pods.length,
        podNames: data.pods.map(pod => pod.name),
        podLogs: logs
      }));
      setIsLoading(false);
    } catch (error) {
      console.error(`Error fetching details for pod ${podName}:`, error);
      setIsLoading(false);
    }
  };

  const handleTabChange = (key: string) => {
    setState(prev => ({ ...prev, activeTab: key }));
  };

  const menuItems = state.pods.map((pod, index) => ({
    key: index.toString(),
    label: pod,
    onClick: () => handlePodClick(pod),
  }));

  return (
    <Panel>
      <Layout>
        <Sider width={260} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            defaultSelectedKeys={['0']}
            style={{
              padding: '10px',
              height: '100%',
              maxHeight: '550px',
              overflowY: 'auto',
              borderRight: 0,
            }}
            items={menuItems}
          />
        </Sider>
        <Layout>
          <Content
            style={{
              margin: 0,
              minHeight: 280,
              backgroundColor: '#f5f5f5',
              padding: '0 12px 12px 12px'
            }}
          >
            <KarmadaHeader
              onTabChange={handleTabChange}
              appName={state.selectedPodDetails?.labels?.app || 'Loading App Name ...'}
              podNames={state.podNames}
            />
            <Spin spinning={isLoading}>
              {state.activeTab === '1' && state.selectedPodDetails && (
                <>
                  <Card title="Metadata" style={{ marginBottom: '16px' }} className='mt-4'>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Label text="UID" />
                        <Children content={state.selectedPodDetails?.uid || '-'} />
                      </Col>
                      <Col span={12}>
                        <Label text="Creation Timestamp" />
                        <Children
                          content={
                            state.selectedPodDetails?.creationTimestamp
                              ? dayjs(state.selectedPodDetails.creationTimestamp).format('YYYY-MM-DD HH:mm:ss')
                              : '-'
                          }
                        />
                      </Col>
                    </Row>
                  </Card>
                  <Card title="Pod Status" style={{ marginBottom: '16px' }}>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Label text="Updated" />
                        <Children content={state.podCount.toString()} />
                      </Col>
                      <Col span={8}>
                        <Label text="Total" />
                        <Children content={state.podCount.toString()} />
                      </Col>
                      <Col span={8}>
                        <Label text="Available" />
                        <Children content={state.podCount.toString()} />
                      </Col>
                    </Row>
                  </Card>
                </>
              )}
              <TerminalLogs
                key={`logs-${state.selectedPodDetails?.uid}`}
                logs={state.podLogs}
                style={{ visibility: state.activeTab === '2' ? 'visible' : 'hidden' }}
              />
            </Spin>
          </Content>
        </Layout>
      </Layout>
    </Panel>
  );
};

export default KarmadaConfigPage;