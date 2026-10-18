import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DeviceSettingsPage from './page'
import type { ReadingFreshness } from '@/lib/reading-status'

const mocks = vi.hoisted(() => ({
  device: {
    id: 'test-device', deviceSn: 'TEST-DEVICE', deviceName: 'Test station',
    deviceType: 'Delta 2', isActive: true, online: false, status: 'Offline',
    connectionStatus: 'offline' as 'online' | 'offline' | 'error',
    readingFreshness: 'missing' as ReadingFreshness,
    dcInputSource: 'auto' as 'auto' | 'solar' | 'adapter',
    currentReading: null as { recordedAt: number } | null,
  },
  updateDevice: vi.fn(),
  setChargingConfig: vi.fn(),
  setDeviceQuota: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))
vi.mock('@/hooks/useConvexData', () => ({
  useConvexDevices: () => ({
    devices: [mocks.device], isLoading: false, error: null, getDeviceById: () => mocks.device,
  }),
  useConvexDeviceMutations: () => ({ updateDevice: mocks.updateDevice, unregisterDevice: vi.fn() }),
  useConvexDeviceControl: () => ({
    setChargingConfig: mocks.setChargingConfig, setDeviceQuota: mocks.setDeviceQuota, isLoading: false,
  }),
  useConvexSchedules: () => ({ schedules: [], createSchedule: vi.fn(), updateSchedule: vi.fn(), removeSchedule: vi.fn() }),
}))

async function renderSettings() {
  const params = Promise.resolve({ deviceId: mocks.device.id })
  await act(async () => {
    render(<Suspense fallback="Loading"><DeviceSettingsPage params={params} /></Suspense>)
  })
  return screen.getByRole('combobox', { name: 'DC input source' })
}

describe('device DC source setting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.device.dcInputSource = 'auto'
    mocks.device.isActive = true
    mocks.device.online = false
    mocks.device.connectionStatus = 'offline'
    mocks.device.readingFreshness = 'missing'
    mocks.device.currentReading = null
    mocks.updateDevice.mockReset().mockResolvedValue(null)
  })

  it('should save XT60 solar wiring as app metadata even while the device is offline', async () => {
    const user = userEvent.setup()
    const select = await renderSettings()
    expect(select).toBeEnabled()
    expect(select).toHaveValue('auto')
    expect(select).toHaveAccessibleDescription(/new readings.*does not report its DC source.*contradictory live readings remain flagged/i)

    await user.selectOptions(select, 'solar')
    expect(mocks.updateDevice).toHaveBeenCalledExactlyOnceWith('test-device', { dcInputSource: 'solar' })
    expect(mocks.setChargingConfig).not.toHaveBeenCalled()
    expect(mocks.setDeviceQuota).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('DC input source saved for future readings')
  })

  it('should display a persisted source and allow returning to automatic', async () => {
    mocks.device.dcInputSource = 'solar'
    const user = userEvent.setup()
    const select = await renderSettings()
    expect(select).toHaveValue('solar')
    await user.selectOptions(select, 'auto')
    expect(mocks.updateDevice).toHaveBeenCalledWith('test-device', { dcInputSource: 'auto' })
  })

  it('should prevent another save while a DC adapter update is pending', async () => {
    let finish!: () => void
    mocks.updateDevice.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    const user = userEvent.setup()
    const select = await renderSettings()
    await user.selectOptions(select, 'adapter')
    expect(select).toBeDisabled()
    expect(select).toHaveValue('adapter')
    expect(screen.getByRole('status')).toHaveTextContent('Saving DC input source')
    expect(mocks.updateDevice).toHaveBeenCalledExactlyOnceWith('test-device', { dcInputSource: 'adapter' })

    await act(async () => finish())
    expect(select).toBeEnabled()
  })

  it('should retain the stored source after a save fails and allow retry', async () => {
    mocks.updateDevice.mockRejectedValueOnce(new Error('Mutation failed'))
    const user = userEvent.setup()
    const select = await renderSettings()
    await user.selectOptions(select, 'solar')
    expect(select).toHaveValue('auto')
    expect(select).toBeEnabled()
    expect(mocks.toastError).toHaveBeenCalledWith('Could not save the DC input source. Please try again.')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    await user.selectOptions(select, 'solar')
    expect(mocks.updateDevice).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['stale', { readingFreshness: 'stale' as const }, 'Reading stale'],
    ['failed refresh', { connectionStatus: 'error' as const }, 'Refresh failed'],
    ['missing readings', { readingFreshness: 'missing' as const }, 'No readings'],
    ['inactive', { isActive: false }, 'Inactive'],
    ['confirmed offline', { connectionStatus: 'offline' as const }, 'Offline'],
  ])('should render %s health and preserve the last reading time', async (_scenario, overrides, label) => {
    const recordedAt = Date.parse('2026-10-18T12:30:00Z')
    Object.assign(mocks.device, { connectionStatus: 'online', readingFreshness: 'recent',
      currentReading: { recordedAt } }, overrides)
    await renderSettings()
    expect(screen.getAllByText(label)).toHaveLength(2)
    expect(screen.getByText(`Last reading: ${new Date(recordedAt).toLocaleString()}`)).toBeInTheDocument()
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument()
    if (label !== 'Offline') expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })

  it('should show no readings and never when no device reading exists', async () => {
    mocks.device.connectionStatus = 'online'
    await renderSettings()
    expect(screen.getAllByText('No readings')).toHaveLength(2)
    expect(screen.getByText('Last reading: Never')).toBeInTheDocument()
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })
})
