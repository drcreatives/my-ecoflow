import { Suspense } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevicePage from './page'
import type { DisplayTelemetry } from '@/types'

// Existing feature coverage remains runnable when temperature is re-enabled.
const temperatureFeature = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/lib/features', () => ({ get TEMPERATURE_FEATURE_ENABLED() { return temperatureFeature.enabled } }))
beforeEach(() => { temperatureFeature.enabled = true })

const mocks = vi.hoisted(() => {
  const device = {
    id: 'test-device', deviceSn: 'TEST-DEVICE', deviceName: 'Test station',
    deviceType: 'Delta 2', isActive: true, online: true, status: 'Online',
    readingFreshness: 'recent', connectionStatus: 'online',
    updatedAt: Date.parse('2026-10-01T12:00:00Z'),
    displayTelemetry: null as DisplayTelemetry | null,
    temperatureRefreshing: false,
    currentReading: {
      recordedAt: Date.parse('2026-10-18T12:34:00Z'),
      inputWatts: 200, acInputWatts: 0 as number | null, dcInputWatts: 200 as number | null,
      chargingType: 2, inputQuality: 'consistent',
      inputMeasurement: 'delta2-pd-mqtt-v1', solarInputWatts: 200,
      powerMeasurement: null as 'pd-totals-mqtt-v1' | null,
      solarPanelInputWatts: null as number | null,
      solarPanelReceivedAt: null as number | null,
      solarPanelMeasurement: null as 'delta2-mppt-mqtt-v1' | null,
      batteryLevel: null as number | null | undefined,
      temperature: null as number | null | undefined,
      outputWatts: 172,
      acOutputWatts: null as number | null,
      dcOutputWatts: null as number | null,
      usbOutputWatts: null as number | null,
    },
  }
  return { device }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))
vi.mock('@/hooks/useConvexData', () => ({
  useConvexDevices: () => ({
    devices: [mocks.device], isLoading: false, error: null,
    getDeviceById: () => mocks.device,
  }),
  useConvexDeviceMutations: () => ({ unregisterDevice: vi.fn(), registerDevice: vi.fn() }),
  useConvexDeviceControl: () => ({
    setPortState: vi.fn(), setBuzzer: vi.fn(), setAcConfig: vi.fn(), isLoading: false,
  }),
}))

describe('device reading timestamp', () => {
  beforeEach(() => {
    mocks.device.currentReading.inputWatts = 200
    mocks.device.currentReading.acInputWatts = 0
    mocks.device.currentReading.dcInputWatts = 200
    mocks.device.currentReading.inputQuality = 'consistent'
    mocks.device.currentReading.powerMeasurement = null
    mocks.device.currentReading.solarPanelInputWatts = null
    mocks.device.currentReading.solarPanelReceivedAt = null
    mocks.device.currentReading.solarPanelMeasurement = null
    mocks.device.currentReading.batteryLevel = null
    mocks.device.currentReading.temperature = null
    mocks.device.currentReading.acOutputWatts = null
    mocks.device.currentReading.dcOutputWatts = null
    mocks.device.currentReading.usbOutputWatts = null
    mocks.device.displayTelemetry = null
    mocks.device.temperatureRefreshing = false
  })

  it('should distinguish live panel input from station input while leaving the AC/DC split unavailable', async () => {
    const receivedAt = mocks.device.currentReading.recordedAt + 1_000
    Object.assign(mocks.device.currentReading, {
      inputWatts: 221, acInputWatts: null, dcInputWatts: null,
      inputQuality: 'incomplete', powerMeasurement: 'pd-totals-mqtt-v1',
      solarPanelInputWatts: 226, solarPanelReceivedAt: receivedAt, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    })
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => { render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>) })
    expect(screen.getByText('221W')).toBeInTheDocument()
    expect(screen.getByText('Solar active')).toBeInTheDocument()
    expect(screen.getByText('Panels: 226W')).toHaveAttribute('title', expect.stringContaining(new Date(receivedAt).toLocaleString()))
    expect(screen.getByText('AC/DC split unavailable')).toBeInTheDocument()
    expect(screen.getByText('Separate panel measurement')).toBeInTheDocument()
    expect(screen.queryByText('AC Input')).not.toBeInTheDocument()
  })

  it('shows the actual reading time and measured source instead of the device metadata time', async () => {
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })

    expect(await screen.findByText('Last Reading Fetched:')).toBeInTheDocument()
    expect(screen.getByText(new Date(mocks.device.currentReading.recordedAt).toLocaleString())).toBeInTheDocument()
    expect(screen.queryByText(new Date(mocks.device.updatedAt).toLocaleDateString())).not.toBeInTheDocument()
    expect(screen.getByText('Solar Input')).toBeInTheDocument()
  })

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY])('should leave missing or invalid SOC and temperature unavailable (%s)', async (value) => {
    mocks.device.currentReading.batteryLevel = value
    mocks.device.currentReading.temperature = value
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })

    expect(screen.getByLabelText('Battery level unavailable')).toHaveTextContent('—')
    expect(screen.getByLabelText('Temperature unavailable')).toHaveTextContent('—')
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText('20°C')).not.toBeInTheDocument()
    expect(screen.queryByText('Normal')).not.toBeInTheDocument()
    const battery = screen.getByRole('progressbar', { name: 'Battery level' })
    expect(battery).not.toHaveAttribute('aria-valuenow')
    expect(battery).toHaveAttribute('aria-valuetext', 'Unavailable')
  })

  it('should display genuine zero SOC and temperature without replacing them', async () => {
    mocks.device.currentReading.batteryLevel = 0
    mocks.device.currentReading.temperature = 0
    mocks.device.displayTelemetry = { temperature: { value: 0, receivedAt: Date.now(), source: 'mqtt' } }
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })

    expect(screen.getByLabelText('Battery level 0%')).toHaveTextContent('0%')
    expect(screen.getByLabelText('Temperature 0°C')).toHaveTextContent('0°C')
    expect(screen.getByRole('progressbar', { name: 'Battery level' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('should retain measured total output while leaving absent output channels unavailable', async () => {
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })
    const breakdown = screen.getByRole('region', { name: 'Power Output Breakdown' })
    expect(within(breakdown).getAllByText('—')).toHaveLength(3)
    expect(within(breakdown).getByText('172W')).toBeInTheDocument()
    expect(within(breakdown).queryByText('0W')).not.toBeInTheDocument()
  })

  it('should preserve zero output channel measurements', async () => {
    mocks.device.currentReading.acOutputWatts = 0
    mocks.device.currentReading.dcOutputWatts = 0
    mocks.device.currentReading.usbOutputWatts = 0
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })
    const breakdown = screen.getByRole('region', { name: 'Power Output Breakdown' })
    expect(within(breakdown).getAllByText('0W')).toHaveLength(3)
  })

  it('should restore prior temperature and output values with per-field cache labels', async () => {
    const receivedAt = Date.parse('2026-10-18T01:00:00Z')
    mocks.device.displayTelemetry = {
      temperature: { value: 24, receivedAt: Date.now(), source: 'mqtt' },
      acOutputWatts: { value: 110, receivedAt: receivedAt - 1_000, source: 'mqtt' },
      dcOutputWatts: { value: 0, receivedAt: receivedAt - 2_000, source: 'rest-cache' },
      usbOutputWatts: { value: 5, receivedAt: receivedAt - 3_000, source: 'mqtt' },
    }
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })

    expect(screen.getByLabelText('Temperature 24°C')).toHaveTextContent('24°C')
    expect(screen.queryByText('Normal')).not.toBeInTheDocument()
    expect(screen.queryByText('High')).not.toBeInTheDocument()
    expect(screen.getAllByText('Cached EcoFlow value')).toHaveLength(1)
    const breakdown = screen.getByRole('region', { name: 'Power Output Breakdown' })
    for (const value of ['110W', '0W', '5W', '172W']) {
      expect(within(breakdown).getByText(value)).toBeInTheDocument()
    }
    expect(within(breakdown).getByText(`Last reported ${new Date(receivedAt - 1_000).toLocaleString()}`)).toHaveAttribute('title', expect.stringContaining('Live report received'))
    expect(within(breakdown).getByText(`Last reported ${new Date(receivedAt - 3_000).toLocaleString()}`)).toBeInTheDocument()
    expect(within(breakdown).getByText('Cached EcoFlow value')).toHaveAttribute('title', `Measurement time unknown; fetched ${new Date(receivedAt - 2_000).toLocaleString()}`)
    expect(screen.getByText(new Date(mocks.device.currentReading.recordedAt).toLocaleString())).toBeInTheDocument()
  })

  it('should prefer current zero measurements to cached values without relabelling them', async () => {
    mocks.device.currentReading.temperature = 0
    mocks.device.currentReading.acOutputWatts = 0
    mocks.device.currentReading.dcOutputWatts = 0
    mocks.device.currentReading.usbOutputWatts = 0
    mocks.device.displayTelemetry = {
      temperature: { value: 0, receivedAt: Date.now(), source: 'mqtt' },
      acOutputWatts: { value: 110, receivedAt: 0, source: 'mqtt' },
      dcOutputWatts: { value: 5, receivedAt: 0, source: 'rest-cache' },
      usbOutputWatts: { value: 8, receivedAt: 0, source: 'mqtt' },
    }
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })
    expect(screen.getByLabelText('Temperature 0°C')).toHaveTextContent('0°C')
    expect(screen.getByText(/^Reported /)).toBeInTheDocument()
    expect(screen.queryByText('Cached EcoFlow value')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Last reported/)).not.toBeInTheDocument()
    const breakdown = screen.getByRole('region', { name: 'Power Output Breakdown' })
    expect(within(breakdown).getAllByText('0W')).toHaveLength(3)
  })

  it('should ignore REST and reading temperatures while waiting for the independent BMS capture', async () => {
    mocks.device.currentReading.temperature = 88
    mocks.device.displayTelemetry = { temperature: { value: 39, receivedAt: Date.now(), source: 'rest-cache' } }
    mocks.device.temperatureRefreshing = true
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })
    expect(screen.getByLabelText('Temperature unavailable')).toHaveTextContent('—')
    expect(screen.getByText('Waiting for temperature')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking temperature')
    expect(screen.queryByText('88°C')).not.toBeInTheDocument()
    expect(screen.queryByText('39°C')).not.toBeInTheDocument()
  })

  it('should prefer a new BMS field receipt over an older collected temperature', async () => {
    const receivedAt = Date.now()
    mocks.device.currentReading.temperature = 88
    mocks.device.displayTelemetry = { temperature: { value: 39, receivedAt, source: 'mqtt' } }
    const params = Promise.resolve({ deviceId: mocks.device.id })
    await act(async () => {
      render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>)
    })
    expect(screen.getByLabelText('Temperature 39°C')).toHaveTextContent('39°C')
    expect(screen.getByText(`Reported ${new Date(receivedAt).toLocaleString()}`)).toBeInTheDocument()
    expect(screen.queryByText('88°C')).not.toBeInTheDocument()
  })
})

it('should hide device-detail temperature while retaining power when paused', async () => {
  temperatureFeature.enabled = false
  mocks.device.displayTelemetry = { temperature: { value: 39, source: 'mqtt', receivedAt: Date.now() } }
  mocks.device.temperatureRefreshing = true
  const params = Promise.resolve({ deviceId: mocks.device.id })
  await act(async () => { render(<Suspense fallback="Loading"><DevicePage params={params} /></Suspense>) })
  expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
  expect(screen.queryByText(/°C|Checking temperature/)).not.toBeInTheDocument()
  expect(screen.getByText('Power Out')).toBeInTheDocument()
})
