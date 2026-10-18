import { describe, expect, it } from 'vitest'
import { getDeviceHealth } from './device-health'

const device = {
  isActive: true, online: false, connectionStatus: 'online' as const,
  readingFreshness: 'recent' as const,
  currentReading: { recordedAt: 1_000 },
}

describe('device health descriptions', () => {
  it.each([
    [{ readingFreshness: 'stale' as const }, 'Reading stale', 'warning'],
    [{ connectionStatus: 'error' as const }, 'Refresh failed', 'warning'],
    [{ readingFreshness: 'missing' as const, currentReading: null }, 'No readings', 'muted'],
    [{ isActive: false }, 'Inactive', 'muted'],
    [{ connectionStatus: 'offline' as const }, 'Offline', 'offline'],
    [{ online: true }, 'Online', 'online'],
  ] as const)('keeps %j distinct from physical disconnection', (overrides, label, tone) => {
    expect(getDeviceHealth({ ...device, ...overrides })).toMatchObject({ label, tone })
  })

  it('retains the actual last reading receipt, including epoch zero, and rejects invalid receipts', () => {
    expect(getDeviceHealth(device).lastReadingAt).toBe(1_000)
    expect(getDeviceHealth({ ...device, currentReading: { recordedAt: 0 } }).lastReadingAt).toBe(0)
    expect(getDeviceHealth({ ...device, currentReading: { recordedAt: 'invalid' } }).lastReadingAt).toBeNull()
    expect(getDeviceHealth({ ...device, currentReading: null }).lastReadingAt).toBeNull()
  })
})
