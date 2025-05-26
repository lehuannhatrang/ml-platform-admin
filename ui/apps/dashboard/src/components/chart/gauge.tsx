import { Gauge, GaugeConfig } from '@ant-design/charts';
import { useTheme } from '@/contexts/theme-context';

type GaugeChartProps = {
  data: GaugeConfig['data'];
  config: GaugeConfig;
};

const GaugeChart = ({ data, config }: GaugeChartProps) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <Gauge
      autoFit={true}
      legend={false}
      scale={{
        color: {
          range: ['#52c41a', '#FAAD14', '#F4664A', '#F5222D'],
        },
      }}
      axis={{
        'y': {
          labelStroke: isDark ? '#fff' : '#000',
          labelStrokeOpacity: 1
        }
      }}
      data={data}
      {...config}
    />
  );
};

export default GaugeChart;
