'use client'

import { FC, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  primary: 'rounded-pill border border-stroke-strong px-4 py-2 text-text-primary hover:bg-surface-2',
  filled: 'rounded-pill bg-brand-primary text-bg-base px-4 py-2 hover:bg-brand-secondary',
  ghost: 'rounded-pill px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-2',
  danger: 'rounded-pill border border-danger/30 px-4 py-2 text-danger hover:bg-danger/10',
} as const

type PillVariant = keyof typeof variants

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant
}

export const PillButton: FC<PillButtonProps> = ({
  variant = 'primary',
  className,
  children,
  ...props
}) => (
  <button
    type="button"
    className={cn(
      variants[variant],
      'text-[12px] font-medium transition-all duration-160 ease-dashboard',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      className,
    )}
    {...props}
  >
    {children}
  </button>
)
