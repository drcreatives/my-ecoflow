import { Power, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockMeter } from '@/hooks/useMockMeters'

interface MeterStatusProps extends Pick<MockMeter, 'connectivity' | 'isActive' | 'deactivationReason'> {
  className?: string
}

export function MeterStatus({ connectivity, isActive, deactivationReason, className }: MeterStatusProps) {
  const online = connectivity === 'online'
  const ConnectionIcon = online ? Wifi : WifiOff

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium',
        online ? 'border-brand-primary/20 bg-brand-primary/10 text-brand-primary' : 'border-stroke-strong bg-surface-2 text-text-secondary',
      )}>
        <ConnectionIcon size={12} aria-hidden="true" />
        {online ? 'Online' : 'Offline'}
      </span>
      <span
        title={deactivationReason === 'balance' ? 'Units exhausted' : deactivationReason === 'manual' ? 'Deactivated by an administrator' : 'Supply enabled'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium',
          isActive ? 'border-stroke-strong text-text-primary' : 'border-warning/20 bg-warning/5 text-warning',
        )}
      >
        <Power size={12} aria-hidden="true" />
        {isActive ? 'Activated' : 'Deactivated'}
      </span>
    </div>
  )
}
