import { getReadingFreshness, type ReadingFreshness } from './reading-status'

interface DeviceHealthInput {
  isActive: boolean
  online: boolean
  status?: string
  connectionStatus?: 'online' | 'offline' | 'error' | null
  readingFreshness?: ReadingFreshness
  currentReading?: {
    recordedAt?: number | Date | string | null
    status?: string | null
  } | null
}

/** A stale or failed reading is not evidence that the physical device is offline. */
export function getDeviceHealth(device: DeviceHealthInput): {
  label: string
  tone: 'online' | 'warning' | 'muted' | 'offline'
  lastReadingAt: number | null
} {
  const recordedAt = device.currentReading?.recordedAt
  const timestamp = recordedAt == null ? NaN : recordedAt instanceof Date
    ? recordedAt.getTime() : typeof recordedAt === 'number' ? recordedAt : new Date(recordedAt).getTime()
  const lastReadingAt = Number.isFinite(timestamp) ? timestamp : null
  const freshness = device.readingFreshness ?? getReadingFreshness(recordedAt)
  const result = (label: string, tone: 'online' | 'warning' | 'muted' | 'offline') => ({
    label, tone, lastReadingAt,
  })

  if (!device.isActive) return result('Inactive', 'muted')
  if (device.connectionStatus === 'offline') return result('Offline', 'offline')
  if (device.connectionStatus === 'error') return result('Refresh failed', 'warning')
  if (freshness === 'missing') return result('No readings', 'muted')
  if (freshness === 'stale') return result('Reading stale', 'warning')
  if (device.currentReading?.status === 'offline') return result('Offline', 'offline')
  if (device.online) return result(device.status === 'Low Battery' ? 'Low Battery' : 'Online',
    device.status === 'Low Battery' ? 'warning' : 'online')
  return result('Connection unknown', 'muted')
}
