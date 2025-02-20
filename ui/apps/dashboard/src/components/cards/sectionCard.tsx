import { Card, Flex } from 'antd';

import { CardProps } from 'antd/lib/card';
import React from 'react';

type SectionCardProps = {
  label: string;
  children: string | React.ReactNode;
} & CardProps;

function SectionCard({ label, children, ...props }: SectionCardProps) {
  return (
    <Card {...props}>
      <Flex>
        <p
          style={{
            fontSize: '24px',
            color: '#666',
          }}
        >
          {label}
        </p>
      </Flex>
      {children}
    </Card>
  );
}

export default SectionCard;
