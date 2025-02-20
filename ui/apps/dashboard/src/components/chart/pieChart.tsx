import { Pie, PieChartProps } from '@ant-design/charts';

type PieChartProps = {
    data: any[];
    config: PieChartProps;
}

const PieChart = ({ data, config }: PieChartProps) => {
    return <Pie data={data} {...config} />;
  };
  
export default PieChart;