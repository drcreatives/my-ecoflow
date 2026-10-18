import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnergyTotals } from '@/lib/analytics'
import type { DeviceReading, TemperatureHistoryReading } from '@/lib/data-utils'
import AnalyticsPage from './page'

const HOUR = 3_600_000
const mocks = vi.hoisted(() => ({
  devices: [{ id: 'station', deviceName: 'Test station', deviceSn: 'TEST', isActive: true }],
  readings: [{ recordedAt: 0, inputWatts: 99_000, outputWatts: 99_000 }],
  energyTotals: null as EnergyTotals | null,
  sampledReadings: 97,
  samplingIntervalMs: 180_000 as number | null,
  collectionIntervalMinutes: 5 as number | null,
  temperatureReadings: [] as TemperatureHistoryReading[],
  temperatureSamplingIntervalMs: null as number | null,
  temperatureSampledReadings: 0,
  summaryAvailable: true,
  temperatureSummary: null as { avgTemperature: number | null; maxTemperature: number | null; temperatureReadings: number } | null,
  summary: {
    totalReadings: 24, temperatureReadings: 0, avgBatteryLevel: 70,
    avgPowerOutput: 100, peakPowerOutput: 200, avgTemperature: null as number | null,
    highestTemperature: null as number | null, startTime: 0, endTime: 86_400_000,
  },
  historyCall: vi.fn(),
  chartTransform: vi.fn((_readings: DeviceReading[], _options?: unknown): Array<{ timestamp: string; formattedTime: string; inputWatts?: number }> => []),
  thermalTransform: vi.fn((readings: TemperatureHistoryReading[]) => readings.map(reading => ({
    timestamp: new Date(reading.recordedAt).toISOString(), formattedTime: 'time', temperature: reading.temperature,
  }))),
  combinedChart: vi.fn(),
  temperatureChart: vi.fn(),
}))

vi.mock('@/hooks/useConvexData', () => ({
  useConvexDevices: () => ({ devices: mocks.devices, isLoading: false }),
  useConvexHistoryReadings: (deviceId: string | null, filters: { aggregation?: string }) => {
    mocks.historyCall(deviceId, filters)
    return {
      readings: mocks.readings, summary: mocks.summaryAvailable ? mocks.summary : null, energyTotals: mocks.energyTotals,
      sampledReadings: mocks.sampledReadings, samplingIntervalMs: mocks.samplingIntervalMs,
      collectionIntervalMinutes: mocks.collectionIntervalMinutes,
      temperatureReadings: mocks.temperatureReadings, temperatureSamplingIntervalMs: mocks.temperatureSamplingIntervalMs,
      temperatureSampledReadings: mocks.temperatureSampledReadings,
      temperatureSummary: mocks.temperatureSummary,
      isLoading: false, error: null,
    }
  },
}))
vi.mock('@/components/charts/HistoryCharts', () => ({
  CombinedChart: (props: unknown) => { mocks.combinedChart(props); return null }, BatteryLevelChart: () => null,
  TemperatureChart: (props: unknown) => { mocks.temperatureChart(props); return null },
  ChartZoomControls: ({ onRangeChange }: { onRangeChange: (range: { startIndex: number; endIndex: number }) => void }) =>
    <button onClick={() => onRangeChange({ startIndex: 1, endIndex: 2 })}>Select middle chart range</button>,
  transformReadingsToChartData: mocks.chartTransform,
  transformTemperatureReadingsToChartData: mocks.thermalTransform,
}))

beforeEach(() => {
  mocks.historyCall.mockClear()
  mocks.chartTransform.mockClear()
  mocks.chartTransform.mockReturnValue([])
  mocks.thermalTransform.mockClear()
  mocks.combinedChart.mockClear()
  mocks.temperatureChart.mockClear()
  mocks.temperatureReadings = []
  mocks.temperatureSamplingIntervalMs = null
  mocks.temperatureSampledReadings = 0
  mocks.summaryAvailable = true
  mocks.temperatureSummary = null
  mocks.summary.totalReadings = 24
  mocks.summary.temperatureReadings = 0
  mocks.summary.avgTemperature = null
  mocks.summary.highestTemperature = null
  mocks.readings = [{ recordedAt: 0, inputWatts: 99_000, outputWatts: 99_000 }]
  mocks.sampledReadings = 97
  mocks.samplingIntervalMs = 180_000
  mocks.collectionIntervalMinutes = 5
  mocks.energyTotals = {
    consumed: 1.23, totalInput: 2.5, unattributedInput: 2.5,
    acInput: 0, dcInput: 0, solarInput: 0,
    sourceIntervals: 0, sourceCoveredMs: 0, solarIntervals: 0, solarCoveredMs: 0,
    solarPanelInput: 0.75, solarPanelIntervals: 10, solarPanelCoveredMs: 4 * HOUR,
  }
})

describe('Analytics energy evidence', () => {
  it('should display separate positive panel energy while station AC/DC and solar remain unavailable', () => {
    render(<AnalyticsPage />)
    const panels = within(screen.getByRole('group', { name: 'Solar panel energy' }))
    expect(panels.getByText('0.75')).toBeInTheDocument()
    expect(panels.getByText(/Separate panel measurement/)).toHaveTextContent('Partial coverage: 4 hr of 24 hr selected')
    expect(panels.getByText('Station DC: Unavailable')).toBeInTheDocument()
    expect(panels.getByText('Confirmed station solar: Unavailable')).toBeInTheDocument()
    const ac = within(screen.getByRole('group', { name: 'AC input energy' }))
    expect(ac.getByText('—')).toBeInTheDocument()
    expect(ac.queryByText('0.00')).not.toBeInTheDocument()
  })

  it('should identify an older measured zero as partial station coverage rather than a whole-period zero', () => {
    Object.assign(mocks.energyTotals!, {
      sourceIntervals: 1, sourceCoveredMs: HOUR,
      solarIntervals: 1, solarCoveredMs: HOUR / 2,
    })
    render(<AnalyticsPage />)
    const ac = within(screen.getByRole('group', { name: 'AC input energy' }))
    expect(ac.getByText('0.00')).toBeInTheDocument()
    expect(ac.getByText('Partial coverage: 1 hr of 24 hr selected')).toBeInTheDocument()
    const panels = within(screen.getByRole('group', { name: 'Solar panel energy' }))
    expect(panels.getByText('Station DC: 0.00 kWh')).toBeInTheDocument()
    expect(panels.getByText('Confirmed station solar: 0.00 kWh')).toBeInTheDocument()
    expect(panels.getByText('Partial coverage: 30 min of 24 hr selected')).toBeInTheDocument()
  })

  it('should preserve an explicitly measured zero panel interval with its own coverage', () => {
    Object.assign(mocks.energyTotals!, { solarPanelInput: 0, solarPanelIntervals: 1, solarPanelCoveredMs: 120_000 })
    render(<AnalyticsPage />)
    const panels = within(screen.getByRole('group', { name: 'Solar panel energy' }))
    expect(panels.getByText('0.00')).toBeInTheDocument()
    expect(panels.getByText(/Separate panel measurement/)).toHaveTextContent('Partial coverage: 2 min of 24 hr selected')
  })

  it('should leave panel energy unavailable when there are no verified panel intervals', () => {
    Object.assign(mocks.energyTotals!, { solarPanelInput: 0, solarPanelIntervals: 0, solarPanelCoveredMs: 0 })
    render(<AnalyticsPage />)
    const panels = within(screen.getByRole('group', { name: 'Solar panel energy' }))
    expect(panels.getByText('—')).toBeInTheDocument()
    expect(panels.queryByText('0.00')).not.toBeInTheDocument()
    expect(panels.getByText(/Panel energy unavailable: no verified panel intervals/)).toBeInTheDocument()
  })

  it('should not round a small positive panel estimate into a displayed zero', () => {
    mocks.energyTotals!.solarPanelInput = 0.0037
    render(<AnalyticsPage />)
    expect(within(screen.getByRole('group', { name: 'Solar panel energy' })).getByText('<0.01')).toBeInTheDocument()
  })

  it('should use backend totals before averaging and keep energy unchanged when chart aggregation changes', () => {
    Object.assign(mocks.energyTotals!, { acInput: 2.34, sourceIntervals: 2, sourceCoveredMs: HOUR })
    render(<AnalyticsPage />)
    expect(within(screen.getByRole('group', { name: 'Energy consumed' })).getByText('1.23')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'AC input energy' })).getByText('2.34')).toBeInTheDocument()
    mocks.readings = [
      { recordedAt: 0, inputWatts: 90_000, outputWatts: 90_000 },
      { recordedAt: HOUR, inputWatts: 90_000, outputWatts: 90_000 },
    ]
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'raw' } })
    expect(mocks.historyCall).toHaveBeenLastCalledWith('station', expect.objectContaining({ aggregation: 'raw' }))
    expect(within(screen.getByRole('group', { name: 'Energy consumed' })).getByText('1.23')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'AC input energy' })).getByText('2.34')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Solar panel energy' })).getByText('0.75')).toBeInTheDocument()
  })

  it('should not calculate a fallback from displayed buckets when backend energy is unavailable', () => {
    mocks.energyTotals = null
    mocks.readings = [
      { recordedAt: 0, inputWatts: 90_000, outputWatts: 90_000 },
      { recordedAt: HOUR, inputWatts: 90_000, outputWatts: 90_000 },
    ]
    render(<AnalyticsPage />)
    for (const name of ['Energy consumed', 'AC input energy', 'Solar panel energy']) {
      expect(within(screen.getByRole('group', { name })).getByText('—')).toBeInTheDocument()
    }
  })

  it('should disclose the pre-aggregation sample count and keep panels separate from station energy', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText(/Energy is estimated from/)).toHaveTextContent('97 sampled readings before chart averaging')
    expect(screen.getByText(/Energy is estimated from/)).toHaveTextContent('Panel energy uses its own report times and is separate from station AC/DC totals')
    expect(screen.getByText(/Energy is estimated from/)).toHaveTextContent('Unclassified station input: 2.50 kWh')
  })

  it('should pass explicit aggregation, sampling, and known cadence to the chart gap calculation', () => {
    render(<AnalyticsPage />)
    expect(mocks.chartTransform).toHaveBeenLastCalledWith(expect.any(Array), {
      aggregation: '1h', samplingIntervalMs: 180_000, collectionIntervalMinutes: 5,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'raw' } })
    expect(mocks.chartTransform).toHaveBeenLastCalledWith(expect.any(Array), {
      aggregation: 'raw', samplingIntervalMs: 180_000, collectionIntervalMinutes: 5,
    })
  })

  it('should chart thermal observations separately while leaving all PD/PV energy totals unchanged', () => {
    mocks.temperatureReadings = [{ deviceId: 'station', deviceName: 'Test station', deviceSn: 'TEST',
      recordedAt: 12_345, temperature: 39, temperatureSampleCount: 1, temperatureMeasurement: 'bms-generic-mqtt-v1' }]
    mocks.summary.temperatureReadings = 1
    mocks.temperatureSampledReadings = 1
    render(<AnalyticsPage />)
    expect(mocks.chartTransform).toHaveBeenLastCalledWith([expect.objectContaining({ inputWatts: 99_000, outputWatts: 99_000 })], expect.anything())
    expect(mocks.thermalTransform).toHaveBeenLastCalledWith(mocks.temperatureReadings, '1h')
    expect(mocks.combinedChart).toHaveBeenLastCalledWith(expect.objectContaining({
      data: [], temperatureData: [expect.objectContaining({ temperature: 39 })],
    }))
    expect(within(screen.getByRole('group', { name: 'Solar panel energy' })).getByText('0.75')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Energy consumed' })).getByText('1.23')).toBeInTheDocument()
    expect(screen.getByText('1 temperature readings')).toBeInTheDocument()
  })

  it('should display a thermal-only range without manufacturing battery or power readings', () => {
    mocks.readings = []
    mocks.summary.totalReadings = 0
    mocks.temperatureReadings = [{ deviceId: 'station', deviceName: 'Test station', deviceSn: 'TEST',
      recordedAt: 123, temperature: 0, temperatureSampleCount: 1, temperatureMeasurement: 'bms-generic-mqtt-v1' }]
    mocks.summary.avgTemperature = 0
    mocks.summary.highestTemperature = 0
    mocks.summary.temperatureReadings = 1
    mocks.temperatureSampledReadings = 1
    render(<AnalyticsPage />)
    expect(screen.queryByText('No Analytics Data')).not.toBeInTheDocument()
    expect(mocks.combinedChart).toHaveBeenLastCalledWith(expect.objectContaining({ data: [], defaultChart: 'temperature' }))
    expect(mocks.temperatureChart).toHaveBeenLastCalledWith(expect.objectContaining({ data: [expect.objectContaining({ temperature: 0 })] }))
    expect(within(screen.getByText('Avg Temperature').parentElement!).getByText('0.0°C')).toBeInTheDocument()
    expect(within(screen.getByText('Battery Level').parentElement!).getByText('—')).toBeInTheDocument()
    expect(within(screen.getByText('Avg Power Output').parentElement!).getByText('—')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Energy consumed' })).getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/Energy is estimated from/)).toHaveTextContent('Unclassified station input: — kWh')
  })

  it('should preserve power zoom selection and filter thermal points by its selected time bounds', () => {
    mocks.chartTransform.mockImplementation(() => [0, 1, 2, 3].map(hour => ({
      timestamp: new Date(hour * HOUR).toISOString(), formattedTime: 'time', inputWatts: 300,
    })))
    mocks.temperatureReadings = [0.5, 1.5, 2.5, 3.5].map(hour => ({ deviceId: 'station', deviceName: 'Test station', deviceSn: 'TEST',
      recordedAt: hour * HOUR, temperature: 39, temperatureSampleCount: 1, temperatureMeasurement: 'bms-generic-mqtt-v1' }))
    render(<AnalyticsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Select middle chart range' }))
    expect(mocks.combinedChart).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ timestamp: new Date(HOUR).toISOString() })]),
      temperatureData: mocks.thermalTransform.mock.results.at(-1)!.value.slice(1, 3),
    }))
    expect(mocks.combinedChart.mock.calls.at(-1)![0].data).toHaveLength(2)
  })

  it('should retain the independent thermal summary and chart when the power summary is null', () => {
    mocks.readings = []
    mocks.summaryAvailable = false
    mocks.temperatureSummary = { avgTemperature: 38.5, maxTemperature: 39, temperatureReadings: 2 }
    mocks.temperatureSampledReadings = 2
    mocks.temperatureReadings = [{ deviceId: 'station', deviceName: 'Test station', deviceSn: 'TEST',
      recordedAt: 123, temperature: 38.5, temperatureSampleCount: 2, temperatureMeasurement: 'bms-generic-mqtt-v1' }]
    render(<AnalyticsPage />)
    const card = screen.getByText('Avg Temperature').parentElement!
    expect(within(card).getByText('38.5°C')).toBeInTheDocument()
    expect(within(card).getByText('Max: 39.0°C')).toBeInTheDocument()
    expect(screen.getByText('2 temperature readings')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Energy consumed' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Unclassified station input:/)).not.toBeInTheDocument()
    expect(mocks.combinedChart).toHaveBeenLastCalledWith(expect.objectContaining({ defaultChart: 'temperature' }))
  })
})
