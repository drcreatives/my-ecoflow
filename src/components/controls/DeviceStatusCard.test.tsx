import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceStatusCard } from './DeviceStatusCard'

// Existing feature coverage remains runnable when temperature is re-enabled.
const temperatureFeature = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/lib/features', () => ({ get TEMPERATURE_FEATURE_ENABLED() { return temperatureFeature.enabled } }))
beforeEach(() => { temperatureFeature.enabled = true })

vi.mock('@/hooks/useConvexData', () => ({
  useConvexDeviceMutations: () => ({ registerDevice: vi.fn(), unregisterDevice: vi.fn() }),
}))

const device = {
  id: 'device-test', deviceSn: 'TEST-DEVICE', deviceName: 'Test power station',
  isActive: true, online: true, userId: '',
  currentReading: {
    recordedAt: Date.now(), inputWatts: 200, acInputWatts: 0, dcInputWatts: 200,
    outputWatts: 100, chargingType: 2, inputQuality: 'consistent' as const,
    inputMeasurement: 'delta2-pd-mqtt-v1' as const, solarInputWatts: 200,
  },
}

describe('DeviceStatusCard telemetry', () => {
  it('should show a compact solar hint while retaining the separate station total and unavailable split', () => {
    const receivedAt = Date.now()
    render(<DeviceStatusCard device={{ ...device, currentReading: {
      ...device.currentReading, inputWatts: 221, acInputWatts: null, dcInputWatts: null,
      inputQuality: 'incomplete', powerMeasurement: 'pd-totals-mqtt-v1',
      solarPanelInputWatts: 226, solarPanelReceivedAt: receivedAt, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    } }} isCompact />)
    expect(screen.getByText('221W')).toBeInTheDocument()
    expect(screen.getByText('Solar active')).toHaveAttribute('title', expect.stringContaining('AC/DC split unavailable'))
    expect(screen.getByText('Solar active')).toHaveAttribute('aria-description', expect.stringContaining(new Date(receivedAt).toLocaleString()))
    expect(screen.queryByText('226W')).not.toBeInTheDocument()
    expect(screen.queryByText('AC Input')).not.toBeInTheDocument()
  })

  it('shows the measured source on the compact dashboard card', () => {
    render(<DeviceStatusCard device={device} isCompact />)
    expect(screen.getByText('Solar Input')).toBeInTheDocument()
  })

  it('shows uncertain source telemetry instead of the stale AC flag', () => {
    render(<DeviceStatusCard device={{
      ...device,
      currentReading: { ...device.currentReading, chargingType: 3, inputQuality: 'inconsistent' },
    }} />)
    expect(screen.getByText('Input (source unknown)')).toBeInTheDocument()
    expect(screen.queryByText('AC Input')).not.toBeInTheDocument()
  })

  it('distinguishes old readings from a confirmed offline device', () => {
    const staleDevice = { ...device, online: false, readingFreshness: 'stale' as const }
    render(<DeviceStatusCard device={staleDevice} />)
    expect(screen.getByText('Reading stale')).toBeInTheDocument()
    expect(screen.queryByText('Device Offline')).not.toBeInTheDocument()
  })

  it('shows a failed refresh even when the last reading timestamp is recent', () => {
    const failedDevice = { ...device, connectionStatus: 'error' as const }
    render(<DeviceStatusCard device={failedDevice} />)
    expect(screen.getByText('Refresh failed')).toBeInTheDocument()
    expect(screen.queryByText('Charging')).not.toBeInTheDocument()
  })

  it('does not display missing power measurements as zero watts', () => {
    render(<DeviceStatusCard device={{ ...device, currentReading: null }} />)
    expect(screen.queryByText('0W')).not.toBeInTheDocument()
    expect(screen.getByText('No readings')).toBeInTheDocument()
  })

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY])('should show unavailable battery and temperature for invalid telemetry (%s)', (value) => {
    render(<DeviceStatusCard device={{
      ...device,
      currentReading: { ...device.currentReading, batteryLevel: value, temperature: value },
    }} />)
    expect(screen.getByLabelText('Battery level unavailable')).toHaveTextContent('—')
    expect(screen.getByLabelText('Temperature unavailable')).toHaveTextContent('—')
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText('20°C')).not.toBeInTheDocument()
  })

  it('should preserve measured zero battery and temperature on compact cards', () => {
    render(<DeviceStatusCard device={{
      ...device,
      currentReading: { ...device.currentReading, batteryLevel: 0, temperature: 0 },
      displayTelemetry: { temperature: { value: 0, receivedAt: Date.now(), source: 'mqtt' } },
    }} isCompact />)
    expect(screen.getByLabelText('Battery level 0%')).toHaveTextContent('0%')
    expect(screen.getByLabelText('Temperature 0°C')).toHaveTextContent('0°C')
  })

  it('should wait for an actual report instead of displaying REST temperature on compact cards', () => {
    const receivedAt = Date.parse('2026-10-18T01:00:00Z')
    render(<DeviceStatusCard device={{
      ...device,
      displayTelemetry: { temperature: { value: 24, receivedAt, source: 'rest-cache' } },
    }} isCompact />)
    expect(screen.getByLabelText('Temperature unavailable')).toHaveTextContent('—')
    expect(screen.getByText('Waiting')).toBeInTheDocument()
    expect(screen.queryByText('24°C')).not.toBeInTheDocument()
  })

  it('should identify the receipt time of a prior live temperature report', () => {
    const receivedAt = Date.now()
    render(<DeviceStatusCard device={{
      ...device,
      displayTelemetry: { temperature: { value: 25, receivedAt, source: 'mqtt' } },
    }} />)
    expect(screen.getByLabelText('Temperature 25°C')).toHaveTextContent('25°C')
    expect(screen.getByText('Just now')).toHaveAttribute('aria-label', `Temperature reported by the device at ${new Date(receivedAt).toLocaleString()}.`)
    expect(screen.queryByText(`Reported ${new Date(receivedAt).toLocaleString()}`)).not.toBeInTheDocument()
  })

  it('should prefer the actual MQTT field over an older reading temperature, including zero', () => {
    render(<DeviceStatusCard device={{
      ...device,
      currentReading: { ...device.currentReading, temperature: 24 },
      displayTelemetry: { temperature: { value: 0, receivedAt: Date.now(), source: 'mqtt' } },
    }} />)
    expect(screen.getByLabelText('Temperature 0°C')).toHaveTextContent('0°C')
    expect(screen.queryByText('Cached EcoFlow value')).not.toBeInTheDocument()
  })

  it('should mark an old MQTT temperature stale while an independent refresh is running', () => {
    const receivedAt = Date.now() - 360_001
    render(<DeviceStatusCard device={{
      ...device, temperatureRefreshing: true,
      currentReading: { ...device.currentReading, temperature: 99 },
      displayTelemetry: { temperature: { value: 39, receivedAt, source: 'mqtt' } },
    }} />)
    expect(screen.getByLabelText('Temperature 39°C')).toHaveTextContent('39°C')
    expect(screen.getByRole('status')).toHaveTextContent('Updating…')
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining(`Stale temperature. Temperature reported by the device at ${new Date(receivedAt).toLocaleString()}`))
    expect(screen.queryByText('99°C')).not.toBeInTheDocument()
  })
})

it('should hide temperature and progress while keeping dashboard power when paused', () => {
  temperatureFeature.enabled = false
  render(<DeviceStatusCard device={{ ...device, displayTelemetry: { temperature: { value: 39, source: 'mqtt', receivedAt: Date.now() } }, temperatureRefreshing: true }} />)
  expect(screen.queryByLabelText(/Temperature/)).not.toBeInTheDocument()
  expect(screen.queryByText(/°C|Updating|Checking temperature/)).not.toBeInTheDocument()
  expect(screen.getByText('100W')).toBeInTheDocument()
})
