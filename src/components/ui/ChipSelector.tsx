'use client'

import { FC, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ChipOption {
  label: string
  value: string
}

export interface ChipSelectorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: ChipOption[]
  value: string
  onChange: (value: string) => void
}

export const ChipSelector: FC<ChipSelectorProps> = ({
  options,
  value,
  onChange,
  className,
  ...props
}) => (
  <div className={cn('flex gap-1.5 flex-wrap', className)} {...props}>
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={cn(
          'rounded-pill border px-3 py-1.5 text-xs font-medium transition-all duration-160 ease-dashboard',
          opt.value === value
            ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
            : 'border-stroke-strong text-text-secondary hover:text-text-primary hover:bg-surface-2',
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
)
