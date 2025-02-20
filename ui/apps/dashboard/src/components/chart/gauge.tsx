import { Gauge, GaugeProps } from '@ant-design/charts';

type GaugeChartProps = {
  data: any[];
  config: GaugeProps;
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
