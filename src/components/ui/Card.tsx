'use client'

import { FC, ReactNode, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/* ── Variants ── */
const variants = {
  default: 'bg-surface-1 border border-stroke-subtle rounded-card shadow-card',
  accent: 'bg-surface-1 border border-brand-primary/20 rounded-card shadow-card',
  hero: 'bg-surface-1 border border-stroke-subtle rounded-card shadow-card col-span-2',
} as const

type CardVariant = keyof typeof variants

/* ── Card ── */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  padding?: boolean
  hover?: boolean
}

export const Card: FC<CardProps> = ({
  variant = 'default',
  padding = true,
  hover = true,
  className,
  children,
  ...props
}) => (
  <div
    className={cn(
      variants[variant],
      padding && 'p-[18px]',
      hover && 'hover:shadow-card-hover hover:border-stroke-strong transition-all duration-160 ease-dashboard',
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

/* ── CardHeader ── */
export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  right?: ReactNode
}

export const CardHeader: FC<CardHeaderProps> = ({
  right,
  className,
  children,
  ...props
}) => (
  <div
    className={cn('flex items-center justify-between mb-3', className)}
    {...props}
  >
    <div className="flex-1 min-w-0">{children}</div>
    {right && <div className="flex-shrink-0 ml-2">{right}</div>}
  </div>
)

/* ── CardTitle ── */
export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export const CardTitle: FC<CardTitleProps> = ({
  className,
  children,
  ...props
}) => (
  <h3
    className={cn('text-section-title font-medium text-text-primary', className)}
    {...props}
  >
    {children}
  </h3>
)
