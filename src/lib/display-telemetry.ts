import type { DisplayTelemetryValue } from '@/types'

interface DisplayMetric {
  value: number | null
  cacheLabel: string | null
  cacheTooltip?: string
}

// Observed full-temperature reports arrive about every five minutes; allow one minute of grace.
export const TEMPERATURE_FRESHNESS_MS = 6 * 60_000
const TEMPERATURE_CLOCK_SKEW_MS = 5_000

export interface TemperatureMetric {
  value: number | null
  receivedAt: number | null
  expiresAt: number | null
  status: 'reported' | 'stale' | 'waiting'
  label: string
  tooltip?: string
}

/** Only the independent BMS capture proves receipt of an explicit temperature. */
export function resolveTemperatureMetric(
  report?: DisplayTelemetryValue | null,
  now = Date.now(),
): TemperatureMetric {
  const waiting: TemperatureMetric = {
    value: null, receivedAt: null, expiresAt: null, status: 'waiting', label: 'Waiting for temperature',
  }
  if (!report || report.source !== 'mqtt' || !Number.isFinite(report.value) || !Number.isFinite(report.receivedAt)) {
    return waiting
  }
  // Allow small browser/server clock skew, but never keep a bad future receipt fresh.
  if (report.receivedAt > now + TEMPERATURE_CLOCK_SKEW_MS) return waiting
  const received = new Date(report.receivedAt)
  if (Number.isNaN(received.getTime())) return waiting
  const expiresAt = report.receivedAt + TEMPERATURE_FRESHNESS_MS
  const stale = now > expiresAt
  const receivedLabel = received.toLocaleString()
  return {
    value: report.value,
    receivedAt: report.receivedAt,
    expiresAt,
    status: stale ? 'stale' : 'reported',
    label: stale ? `Stale • reported ${receivedLabel}` : `Reported ${receivedLabel}`,
    tooltip: `Temperature reported by the device at ${receivedLabel}.`,
  }
}

/** Compact age labels and the next UI-only clock boundary; never a fetch interval. */
export function getTemperatureAge(metric: TemperatureMetric, now = Date.now()): {
  label: string
  nextUpdateAt: number | null
} {
  if (metric.receivedAt === null) return { label: 'Waiting', nextUpdateAt: null }
  const age = Math.max(0, now - metric.receivedAt)
  const unit = age < 3_600_000 ? 60_000 : age < 86_400_000 ? 3_600_000 : 86_400_000
  const amount = Math.floor(age / unit)
  const unitLabel = unit === 60_000 ? 'min' : unit === 3_600_000 ? 'hr' : 'day'
  const shortUnit = unit === 60_000 ? 'm' : unit === 3_600_000 ? 'h' : 'd'
  return {
    label: metric.status === 'stale' ? `Stale · ${amount}${shortUnit}`
      : age < 60_000 ? 'Just now' : `${amount} ${unitLabel} ago`,
    nextUpdateAt: metric.receivedAt + (amount + 1) * unit,
  }
}

/** Display-only fallback. Never merge these values into a collected reading. */
export function resolveDisplayMetric(
  currentValue: number | null | undefined,
  cached?: DisplayTelemetryValue | null,
): DisplayMetric {
  if (typeof currentValue === 'number' && Number.isFinite(currentValue)) {
    return { value: currentValue, cacheLabel: null }
  }
  if (!cached || !Number.isFinite(cached.value) || !Number.isFinite(cached.receivedAt)) {
    return { value: null, cacheLabel: null }
  }
  const received = new Date(cached.receivedAt)
  if (Number.isNaN(received.getTime())) return { value: null, cacheLabel: null }
  const receivedLabel = received.toLocaleString()
  return cached.source === 'mqtt'
    ? {
        value: cached.value,
        cacheLabel: `Last reported ${receivedLabel}`,
        cacheTooltip: `Live report received ${receivedLabel}; device measurement time unknown.`,
      }
    : {
        value: cached.value,
        cacheLabel: 'Cached EcoFlow value',
        cacheTooltip: `Measurement time unknown; fetched ${receivedLabel}`,
      }
}
