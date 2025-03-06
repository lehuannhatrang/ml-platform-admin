import { Card } from 'antd';

import { CardProps } from 'antd/lib/card';
import React from 'react';

type SectionCardProps = {
  children: string | React.ReactNode;
} & CardProps;

function SectionCard({ children, ...props }: SectionCardProps) {
  return (
    <Card {...props}>
      {children}
    </Card>
  );
}

export default SectionCard;
