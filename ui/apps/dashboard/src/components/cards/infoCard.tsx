import { Card, Flex } from 'antd';
import { CardProps } from 'antd/lib/card';
import { useTheme } from '@/contexts/theme-context';

type InfoCardProps = {
  label: string;
  value?: string | number;
} & CardProps;

function InfoCard({ label, value, ...props }: InfoCardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <Card {...props}>
      <Flex>
        <p
          style={{
            fontSize: '14px',
            color: isDark ? 'rgba(255, 255, 255, 0.65)' : '#666',
          }}
        >
          {label}
        </p>
      </Flex>

      <Flex justify="flex-end">
        <p
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: isDark ? 'rgba(255, 255, 255, 0.95)' : 'inherit',
          }}
        >
          {value || '-'}
        </p>
      </Flex>
    </Card>
  );
}

export default InfoCard;
