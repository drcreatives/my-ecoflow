'use client'

import { FC, HTMLAttributes, ReactNode, useRef, useState, useEffect } from 'react'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface KebabMenuItem {
  label: string
  onClick: () => void
  icon?: ReactNode
  danger?: boolean
}

export interface KebabMenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  items: KebabMenuItem[]
}

export const KebabMenu: FC<KebabMenuProps> = ({ items, className, ...props }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)} {...props}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="p-1 text-icon hover:text-text-primary rounded-inner transition-all duration-160"
        aria-label="More options"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface-2 border border-stroke-subtle rounded-inner shadow-card p-1 min-w-[140px]">
          {items.map((item, i) => (
            <button
              type="button"
              key={i}
              onClick={() => {
                item.onClick()
                setOpen(false)
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-xs rounded-[8px] transition-all duration-160',
                item.danger
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
