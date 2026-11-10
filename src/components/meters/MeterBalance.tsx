import { cn } from '@/lib/utils'
import { formatEnergy, LOW_BALANCE_WH } from './meter-format'

interface MeterBalanceProps {
  balanceWh: number
  purchasedWh: number
}

export function MeterBalance({ balanceWh, purchasedWh }: MeterBalanceProps) {
  const low = balanceWh <= LOW_BALANCE_WH
  const percent = purchasedWh > 0
    ? Math.min(100, Math.max(0, balanceWh / purchasedWh * 100))
    : 0

  return (
    <div className="min-w-[100px]">
      <div className={cn(
        'text-sm font-medium tabular-nums',
        low ? 'text-warning' : 'text-text-primary',
      )}>
        {formatEnergy(balanceWh)}
      </div>
      <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div
          className={cn('h-full rounded-full', low ? 'bg-warning' : 'bg-brand-primary')}
          style={{ width: `${percent}%` }}
        />
      </div>
      {low && (
        <p className="mt-1 text-[10px] text-warning">
          {balanceWh === 0 ? 'Units exhausted' : 'Low balance'}
        </p>
      )}
    </div>
  )
}
