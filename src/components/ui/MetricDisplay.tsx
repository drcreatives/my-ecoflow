'use client'

import { FC, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface MetricDisplayProps extends HTMLAttributes<HTMLDivElement> {
  value: string | number
  unit?: string
  trend?: ReactNode
}

export const MetricDisplay: FC<MetricDisplayProps> = ({
  value,
  unit,
  trend,
  className,
  ...props
}) => (
  <div className={cn('flex flex-col', className)} {...props}>
    <span className="text-metric font-medium tracking-[-0.02em] text-text-primary">
      {value}
    </span>
    {unit && (
      <span className="text-[11px] text-text-muted uppercase tracking-wider mt-1">
        {unit}
      </span>
    )}
    {trend && <div className="mt-2">{trend}</div>}
  </div>
)
