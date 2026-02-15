'use client'

import { FC, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'onToggle'> {
  checked: boolean
  onToggle: (checked: boolean) => void
  label?: string
}

export const Toggle: FC<ToggleProps> = ({
  checked,
  onToggle,
  label,
  disabled,
  className,
  ...props
}) => (
  <label
    className={cn(
      'inline-flex items-center gap-2 cursor-pointer',
      disabled && 'opacity-50 cursor-not-allowed',
      className,
    )}
  >
    <div className="relative">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        disabled={disabled}
        {...props}
      />
      <div
        className={cn(
          'w-12 h-6 rounded-full border transition-all duration-180 ease-dashboard',
          checked
            ? 'bg-brand-primary border-brand-primary'
            : 'bg-surface-2 border-stroke-subtle',
        )}
      />
      <div
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-all duration-180 ease-dashboard',
          checked
            ? 'translate-x-6 bg-white shadow-[0_0_8px_rgba(68,175,33,0.4)]'
            : 'translate-x-0 bg-text-muted',
        )}
      />
    </div>
    {label && (
      <span className="text-sm text-text-primary select-none">{label}</span>
    )}
  </label>
)
