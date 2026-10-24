import { render, screen, within, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HistoryPage from './page'
import AnalyticsPage from '../analytics/page'
import type { TemperatureHistoryReading } from '@/lib/data-utils'

// Existing feature coverage remains runnable when temperature is re-enabled.
const temperatureFeature = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/lib/features', () => ({ get TEMPERATURE_FEATURE_ENABLED() { return temperatureFeature.enabled } }))
beforeEach(() => { temperatureFeature.enabled = true })

const mocks = vi.hoisted(() => ({
  devices: [{ id: 'device-test', deviceName: 'Test station', deviceSn: 'TEST-DEVICE', isActive: true }],
  readings: [{
    deviceId: 'device-test', recordedAt: 1_790_000_000_000, batteryLevel: 70,
    inputWatts: 100, outputWatts: 100, temperature: null as number | null | undefined,
    inputQuality: 'incomplete', powerMeasurement: null as 'pd-totals-mqtt-v1' | null,
    solarPanelInputWatts: null as number | null,
    solarPanelReceivedAt: null as number | null,
    solarPanelMeasurement: null as 'delta2-mppt-mqtt-v1' | null,
  }],
  summary: {
    totalReadings: 499, temperatureReadings: 0,
    avgBatteryLevel: 70, avgPowerOutput: 100, peakPowerOutput: 200,
    avgTemperature: null as number | null, highestTemperature: null as number | null,
    startTime: 1_789_913_600_000, endTime: 1_790_000_000_000,
  },
  samplingIntervalMs: null as number | null,
  temperatureReadings: [] as TemperatureHistoryReading[],
  temperatureSamplingIntervalMs: null as number | null,
  temperatureSampledReadings: 0,
  summaryAvailable: true,
  temperatureSummary: null as { avgTemperature: number | null; maxTemperature: number | null; temperatureReadings: number } | null,
}))

vi.mock('@/hooks/useConvexData', () => ({
  useConvexDevices: () => ({ devices: mocks.devices, isLoading: false }),
  useConvexHistoryReadings: () => ({
    readings: mocks.readings, summary: mocks.summaryAvailable ? mocks.summary : null,
    samplingIntervalMs: mocks.samplingIntervalMs, isLoading: false, error: null,
    temperatureReadings: mocks.temperatureReadings, temperatureSamplingIntervalMs: mocks.temperatureSamplingIntervalMs,
    temperatureSampledReadings: mocks.temperatureSampledReadings,
    temperatureSummary: mocks.temperatureSummary,
  }),
}))
vi.mock('@/components/charts/HistoryCharts', () => ({
  CombinedChart: () => null, BatteryLevelChart: () => null, TemperatureChart: () => null,
  ChartZoomControls: () => null, transformReadingsToChartData: () => [],
  transformTemperatureReadingsToChartData: () => [],
}))

beforeEach(() => {
  mocks.readings = [{
    deviceId: 'device-test', recordedAt: 1_790_000_000_000, batteryLevel: 70,
    inputWatts: 100, outputWatts: 100, temperature: null,
    inputQuality: 'incomplete', powerMeasurement: null,
    solarPanelInputWatts: null, solarPanelReceivedAt: null, solarPanelMeasurement: null,
  }]
  mocks.temperatureReadings = []
  mocks.temperatureSamplingIntervalMs = null
  mocks.temperatureSampledReadings = 0
  mocks.summaryAvailable = true
  mocks.temperatureSummary = null
  mocks.readings[0].inputWatts = 100
  mocks.readings[0].powerMeasurement = null
  mocks.readings[0].solarPanelInputWatts = null
  mocks.readings[0].solarPanelReceivedAt = null
  mocks.readings[0].solarPanelMeasurement = null
  mocks.readings[0].temperature = null
  mocks.summary.avgTemperature = null
  mocks.summary.highestTemperature = null
  mocks.summary.temperatureReadings = 0
  mocks.samplingIntervalMs = null
})

describe('historical temperature display', () => {
  it('should retain the raw station total and display panel watts with their own receipt without assigning a station source', () => {
    const receivedAt = mocks.readings[0].recordedAt + 1_000
    Object.assign(mocks.readings[0], {
      inputWatts: 221, powerMeasurement: 'pd-totals-mqtt-v1', solarPanelInputWatts: 226,
      solarPanelReceivedAt: receivedAt, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    })
    render(<HistoryPage />)
    expect(screen.queryByText('Panels: 226W')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'raw' } })
    const row = screen.getAllByRole('row')[1]
    const input = within(row).getAllByRole('cell')[3]
    expect(within(input).getByText('221W')).toBeInTheDocument()
    expect(within(input).getByText('Panels: 226W')).toHaveAttribute('title', expect.stringContaining(new Date(receivedAt).toLocaleString()))
    expect(within(input).getByText('Panels: 226W')).toHaveAttribute('aria-description', expect.stringContaining('AC/DC split unavailable'))
  })

  it.each([null, undefined, NaN, Infinity])('should show missing raw temperature as unavailable rather than zero (%s)', temperature => {
    mocks.readings[0].temperature = temperature
    render(<HistoryPage />)
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getAllByRole('cell')[8]).toHaveTextContent('—')
    expect(within(row).queryByText(/0(?:\.0)?°C/)).not.toBeInTheDocument()
  })

  it('should preserve an explicitly stored zero temperature in a history row', () => {
    mocks.readings[0].temperature = 0
    render(<HistoryPage />)
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getAllByRole('cell')[8]).toHaveTextContent('0.0°C')
  })

  it('should preserve real zero battery and output measurements while missing fields remain unavailable', () => {
    Object.assign(mocks.readings[0], { batteryLevel: 0, outputWatts: 0, acOutputWatts: 0, dcOutputWatts: 0, usbOutputWatts: 0 })
    render(<HistoryPage />)
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent('0.0%')
    expect(cells.slice(4, 8).every(cell => cell.textContent === '0W')).toBe(true)
  })

  it.each([{ name: 'History', Page: HistoryPage }, { name: 'Analytics', Page: AnalyticsPage }])('should not show a zero average or maximum in $name when the summary has no temperature', ({ Page }) => {
    render(<Page />)
    expect(screen.getByText('Max: —')).toBeInTheDocument()
    expect(screen.queryByText(/0(?:\.0)?°C/)).not.toBeInTheDocument()
    const card = screen.getByText('Avg Temperature').parentElement!
    expect(within(card).getByText('—')).toBeInTheDocument()
  })

  it.each([{ name: 'History', Page: HistoryPage }, { name: 'Analytics', Page: AnalyticsPage }])('should explain the displayed sample and its interval in $name', ({ Page }) => {
    mocks.samplingIntervalMs = 180_000
    render(<Page />)
    expect(screen.getByRole('note')).toHaveTextContent('approximately one reading per 3.0 minutes')
    expect(screen.getByRole('note')).toHaveTextContent('displayed sample, not every stored reading')
  })

  it('should identify a sampled raw table without calling it every stored reading', () => {
    mocks.samplingIntervalMs = 180_000
    render(<HistoryPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'raw' } })
    expect(screen.getByText(/Raw Data \(sampled\)/)).toBeInTheDocument()
    expect(screen.getByText('0 temperature readings')).toBeInTheDocument()
  })

  it.each([{ name: 'History', Page: HistoryPage }, { name: 'Analytics', Page: AnalyticsPage }])('should disclose sparse temperature evidence in $name without changing a real zero average', ({ Page }) => {
    mocks.summary.avgTemperature = 0
    mocks.summary.highestTemperature = 0
    mocks.summary.temperatureReadings = 0
    mocks.temperatureSampledReadings = 2
    render(<Page />)
    expect(screen.getByText('2 temperature readings')).toBeInTheDocument()
    const card = screen.getByText('Avg Temperature').parentElement!
    expect(within(card).getByText('0.0°C')).toBeInTheDocument()
    expect(within(card).getByText('Max: 0.0°C')).toBeInTheDocument()
  })

  it('should show an independent raw temperature with its actual receipt and unavailable power fields', () => {
    const recordedAt = mocks.readings[0].recordedAt + 12_345
    mocks.temperatureReadings = [{ deviceId: 'device-test', deviceName: 'Test station', deviceSn: 'TEST-DEVICE',
      recordedAt, temperature: 0, temperatureSampleCount: 1, temperatureMeasurement: 'bms-generic-mqtt-v1' }]
    mocks.summary.temperatureReadings = 1
    mocks.temperatureSampledReadings = 1
    render(<HistoryPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'raw' } })
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText(new Date(recordedAt).toLocaleString())).toBeInTheDocument()
    expect(within(row).getByText('Temperature observation')).toBeInTheDocument()
    expect(within(row).getAllByRole('cell').slice(2, 8).every(cell => cell.textContent === '—')).toBe(true)
    expect(within(row).getAllByRole('cell')[8]).toHaveTextContent('0.0°C')
    expect(screen.getByText('Showing 1-2 of 2 rows')).toBeInTheDocument()
    expect(screen.getByText(/Latest history point:/)).toHaveTextContent(new Date(recordedAt).toLocaleString())
  })

  it('should render a thermal-only history range, permit export, and identify sampled observation counts', () => {
    mocks.readings = []
    mocks.temperatureReadings = [{ deviceId: 'device-test', deviceName: 'Test station', deviceSn: 'TEST-DEVICE',
      recordedAt: 1_790_000_000_000, temperature: 38, temperatureSampleCount: 12, temperatureMeasurement: 'bms-generic-mqtt-v1' }]
    mocks.summary.temperatureReadings = 12
    mocks.temperatureSampledReadings = 12
    mocks.temperatureSamplingIntervalMs = 600_000
    render(<HistoryPage />)
    expect(screen.queryByText('No Historical Data')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
    expect(screen.getByText('12 temperature readings (sampled)')).toBeInTheDocument()
    expect(screen.getByText('12 temperature readings')).toBeInTheDocument()
    expect(screen.getByText('Showing 1-1 of 1 rows')).toBeInTheDocument()
    expect(within(screen.getAllByRole('row')[1]).getByText('38.0°C')).toBeInTheDocument()
  })

  it('should show independent thermal summary statistics when the power summary is null', () => {
    mocks.readings = []
    mocks.summaryAvailable = false
    mocks.temperatureSummary = { avgTemperature: 0, maxTemperature: 0, temperatureReadings: 1 }
    mocks.temperatureSampledReadings = 1
    mocks.temperatureReadings = [{ deviceId: 'device-test', deviceName: 'Test station', deviceSn: 'TEST-DEVICE',
      recordedAt: 1_790_000_000_000, temperature: 0, temperatureSampleCount: 1, temperatureMeasurement: 'bms-generic-mqtt-v1' }]
    render(<HistoryPage />)
    const card = screen.getByText('Avg Temperature').parentElement!
    expect(within(card).getByText('0.0°C')).toBeInTheDocument()
    expect(within(card).getByText('Max: 0.0°C')).toBeInTheDocument()
    expect(within(card).getByText('1 temperature readings')).toBeInTheDocument()
    expect(within(screen.getByText('Battery Level').parentElement!).getByText('—')).toBeInTheDocument()
    expect(within(screen.getByText('Avg Power Output').parentElement!).getByText('—')).toBeInTheDocument()
  })
})

it('should hide history temperature columns, summary and independent rows when paused', () => {
  temperatureFeature.enabled = false
  mocks.temperatureReadings = [{ deviceId: 'device-test', deviceName: 'Test station', deviceSn: 'TEST-DEVICE', recordedAt: 1_790_000_001_000, temperature: 39, temperatureSampleCount: 1, temperatureMeasurement: 'bms-generic-mqtt-v1' }]
  mocks.temperatureSummary = { avgTemperature: 39, maxTemperature: 39, temperatureReadings: 1 }
  render(<HistoryPage />)
  expect(screen.queryByRole('columnheader', { name: 'Temperature' })).not.toBeInTheDocument()
  expect(screen.queryByText('Avg Temperature')).not.toBeInTheDocument()
  expect(screen.queryByText('Temperature observation')).not.toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Input Power' })).toBeInTheDocument()
  expect(screen.getAllByRole('row')).toHaveLength(2)
})
