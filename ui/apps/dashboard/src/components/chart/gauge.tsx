import { Gauge, GaugeConfig } from '@ant-design/charts';

type GaugeChartProps = {
  data: GaugeConfig['data'];
  config: GaugeConfig;
};

const GaugeChart = ({ data, config }: GaugeChartProps) => {
  return (
    <Gauge
      autoFit={true}
      legend={false}
      scale={{
        color: {
          range: ['green', '#FAAD14', '#F4664A', '#F5222D'],
        },
      }}
      data={data}
      {...config}
    />
  );
};

export default GaugeChart;
