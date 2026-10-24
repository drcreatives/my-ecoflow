import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevicesPage from './page'
import type { DisplayTelemetry } from '@/types'
import type { ReadingFreshness } from '@/lib/reading-status'

// Existing feature coverage remains runnable when temperature is re-enabled.
const temperatureFeature = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/lib/features', () => ({ get TEMPERATURE_FEATURE_ENABLED() { return temperatureFeature.enabled } }))
beforeEach(() => { temperatureFeature.enabled = true })

const mocks = vi.hoisted(() => {
  const device = {
    id: 'device-test', deviceSn: 'TEST-DEVICE', deviceName: 'Test station', userId: '',
    isActive: true, online: true, status: 'Online',
    connectionStatus: 'online' as 'online' | 'offline' | 'error',
    readingFreshness: 'recent' as ReadingFreshness,
    displayTelemetry: null as DisplayTelemetry | null,
    temperatureRefreshing: false,
    currentReading: { recordedAt: 0, batteryLevel: 70, inputWatts: 100, outputWatts: 100, temperature: null as number | null },
  }
  return { device, additionalDevices: [] as (typeof device)[] }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useConvexData', () => ({
  useConvexDevices: () => ({ devices: [mocks.device, ...mocks.additionalDevices], isLoading: false, error: null }),
}))

describe('device list temperature evidence', () => {
  beforeEach(() => {
    mocks.device.currentReading.temperature = null
    mocks.device.displayTelemetry = null
    mocks.device.temperatureRefreshing = false
    mocks.device.online = true
    mocks.device.isActive = true
    mocks.device.connectionStatus = 'online'
    mocks.device.readingFreshness = 'recent'
    mocks.additionalDevices = []
  })

  it('should wait for a BMS report instead of showing REST temperature as current', () => {
    const receivedAt = Date.parse('2026-10-18T01:00:00Z')
    mocks.device.displayTelemetry = { temperature: { value: 24, receivedAt, source: 'rest-cache' } }
    render(<DevicesPage />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Waiting')).toBeInTheDocument()
    expect(screen.queryByText('24°C')).not.toBeInTheDocument()
    expect(screen.queryByText('0°C')).not.toBeInTheDocument()
  })

  it('should display a genuine zero in the BMS report instead of an older reading', () => {
    mocks.device.currentReading.temperature = 99
    mocks.device.displayTelemetry = { temperature: { value: 0, receivedAt: Date.now(), source: 'mqtt' } }
    render(<DevicesPage />)
    expect(screen.getByText('0°C')).toBeInTheDocument()
    expect(screen.queryByText(/^Last reported/)).not.toBeInTheDocument()
    expect(screen.getByText('Just now')).toBeInTheDocument()
  })

  it('should leave temperature unavailable when no current or cached value exists', () => {
    render(<DevicesPage />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0°C')).not.toBeInTheDocument()
  })

  it('should show an older real temperature as stale and show checking independently of power status', () => {
    const receivedAt = Date.now() - 360_001
    mocks.device.online = false
    mocks.device.connectionStatus = 'offline'
    mocks.device.temperatureRefreshing = true
    mocks.device.displayTelemetry = { temperature: { value: 39, receivedAt, source: 'mqtt' } }
    render(<DevicesPage />)
    expect(screen.getByLabelText('Temperature 39°C')).toHaveTextContent('39°C')
    expect(screen.getByRole('status', { name: /^Updating temperature\./ })).toHaveTextContent('Updating…')
    expect(screen.getByRole('status', { name: /^Updating temperature\./ })).toHaveAttribute('aria-label', expect.stringContaining(`Stale temperature. Temperature reported by the device at ${new Date(receivedAt).toLocaleString()}`))
    expect(screen.getByText('Device is offline')).toBeInTheDocument()
  })

  it.each([
    ['stale', { readingFreshness: 'stale' as const }, 'Reading stale'],
    ['failed refresh', { connectionStatus: 'error' as const }, 'Refresh failed'],
    ['missing readings', { readingFreshness: 'missing' as const }, 'No readings'],
    ['inactive', { isActive: false }, 'Inactive'],
  ])('should identify %s without claiming the device is physically offline', (_scenario, overrides, label) => {
    Object.assign(mocks.device, overrides, { online: false })
    const receivedAt = Date.now()
    mocks.device.currentReading.recordedAt = receivedAt
    mocks.device.displayTelemetry = { temperature: { value: 41, receivedAt, source: 'mqtt' } }
    render(<DevicesPage />)
    expect(screen.getByRole('status', { name: 'Device health' })).toHaveTextContent(label)
    expect(screen.getByRole('status', { name: 'Device health' })).toHaveTextContent(`Last reading: ${new Date(receivedAt).toLocaleString()}`)
    expect(screen.getAllByText(label)).toHaveLength(2)
    expect(screen.queryByText('Device is offline')).not.toBeInTheDocument()
    expect(screen.queryByText('Last seen: Unknown')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Temperature 41°C')).toBeInTheDocument()
  })

  it('should count and filter only confirmed offline devices in a mixed health list', async () => {
    const user = userEvent.setup()
    const base = { ...mocks.device, currentReading: { ...mocks.device.currentReading, recordedAt: Date.now() } }
    mocks.additionalDevices = [
      { ...base, id: 'offline', deviceName: 'Confirmed offline station', online: false, connectionStatus: 'offline' },
      { ...base, id: 'stale', deviceName: 'Stale station', online: false, readingFreshness: 'stale' },
      { ...base, id: 'error', deviceName: 'Refresh failed station', online: false, connectionStatus: 'error' },
      { ...base, id: 'missing', deviceName: 'Missing readings station', online: false, readingFreshness: 'missing' },
      { ...base, id: 'inactive', deviceName: 'Inactive station', online: false, isActive: false },
    ]
    render(<DevicesPage />)
    const summary = screen.getByRole('group', { name: 'Offline devices' })
    expect(within(summary).getByText('1')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3, name: /station$/i })).toHaveLength(6)

    await user.click(screen.getByRole('button', { name: 'All Devices' }))
    await user.click(screen.getByRole('button', { name: 'Offline Only' }))
    expect(screen.getByRole('heading', { name: 'Confirmed offline station' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3, name: /station$/i })).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Stale station' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Refresh failed station' })).not.toBeInTheDocument()
    expect(within(summary).getByText('1')).toBeInTheDocument()
  })
})

it('should hide device-list temperature and updating indicators when paused', () => {
  temperatureFeature.enabled = false
  mocks.device.online = true
  mocks.device.isActive = true
  mocks.device.displayTelemetry = { temperature: { value: 39, source: 'mqtt', receivedAt: Date.now() } }
  mocks.device.temperatureRefreshing = true
  render(<DevicesPage />)
  expect(screen.queryByLabelText(/Temperature/)).not.toBeInTheDocument()
  expect(screen.queryByText(/°C|Updating|Checking temperature/)).not.toBeInTheDocument()
  expect(screen.getByText('Test station')).toBeInTheDocument()
})
