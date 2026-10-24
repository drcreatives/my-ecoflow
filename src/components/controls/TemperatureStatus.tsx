'use client'

import { useId, useState } from 'react'
import { getTemperatureAge, type TemperatureMetric } from '@/lib/display-telemetry'
import { TEMPERATURE_FEATURE_ENABLED } from '@/lib/features'
import { cn } from '@/lib/utils'

interface TemperatureStatusProps {
  metric: TemperatureMetric
  refreshing?: boolean
  className?: string
  compact?: boolean
}

function CompactTemperatureStatus({ metric, refreshing, className }: TemperatureStatusProps) {
  const tooltipId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const showTooltip = (hovered || focused) && !dismissed
  const description = `${refreshing ? 'Updating temperature. ' : ''}${metric.status === 'stale' ? 'Stale temperature. ' : ''}${metric.tooltip ?? metric.label}`
  return (
    <span className={cn('relative inline-flex', className)}>
      <span
        className="text-xs text-text-muted whitespace-nowrap cursor-help rounded focus-visible:outline focus-visible:outline-brand-primary"
        tabIndex={0}
        aria-label={description}
        aria-describedby={showTooltip ? tooltipId : undefined}
        role={refreshing ? 'status' : undefined}
        onMouseEnter={() => { setHovered(true); setDismissed(false) }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => { setFocused(true); setDismissed(false) }}
        onBlur={() => setFocused(false)}
        onKeyDown={event => { if (event.key === 'Escape') setDismissed(true) }}
      >
        {refreshing ? 'Updating…' : getTemperatureAge(metric).label}
      </span>
      {showTooltip && (
        <span id={tooltipId} role="tooltip" className="absolute right-0 bottom-full z-50 mb-2 w-56 rounded-inner border border-stroke-subtle bg-surface-2 p-3 text-left text-xs text-text-primary shadow-card whitespace-normal pointer-events-none">
          {description}
        </span>
      )}
    </span>
  )
}

export function TemperatureStatus({ metric, refreshing, className, compact = false }: TemperatureStatusProps) {
  if (!TEMPERATURE_FEATURE_ENABLED) return null
  if (compact) return <CompactTemperatureStatus metric={metric} refreshing={refreshing} className={className} />
  return (
    <span className={cn('flex flex-col text-xs text-text-muted', className)}>
      <span title={metric.tooltip} aria-description={metric.tooltip}>{metric.label}</span>
      {refreshing && <span role="status">Checking temperature…</span>}
    </span>
  )
}
