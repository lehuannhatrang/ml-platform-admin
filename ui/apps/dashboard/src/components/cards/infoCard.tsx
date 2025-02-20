import { Card, Flex } from 'antd';

import { CardProps } from 'antd/lib/card';

type InfoCardProps = {
  label: string;
  value?: string | number;
} & CardProps;

function InfoCard({ label, value, ...props }: InfoCardProps) {
  return (
    <Card {...props}>
      <Flex>
        <p
          style={{
            fontSize: '14px',
            color: '#666',
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
          }}
        >
          {value || '-'}
        </p>
      </Flex>
    </Card>
  );
}

export default InfoCard;
