import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  ChartZoomControls,
  resizeChartRange,
  transformReadingsToChartData,
  type ChartDataPoint,
  TemperatureChart,
  CustomTooltip,
  getSolarPanelSeries,
  transformTemperatureReadingsToChartData,
  getTemperatureSeries,
  CombinedChart,
} from './HistoryCharts'
import type { DeviceReading, TemperatureHistoryReading } from '@/lib/data-utils'

vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

const chartData: ChartDataPoint[] = Array.from({ length: 100 }, (_, index) => ({
  timestamp: new Date(index * 60_000).toISOString(),
  formattedTime: `${index}:00`,
  totalOutput: index,
}))

describe('chart zoom', () => {
  it('zooms in around the center of the visible range', () => {
    expect(
      resizeChartRange({ startIndex: 0, endIndex: 99 }, 100, 'in')
    ).toEqual({ startIndex: 20, endIndex: 79 })
  })

  it('zooms out without exceeding the available data', () => {
    expect(
      resizeChartRange({ startIndex: 20, endIndex: 79 }, 100, 'out')
    ).toEqual({ startIndex: 0, endIndex: 99 })
  })

  it('exposes horizontal zoom and reset controls', async () => {
    const user = userEvent.setup()
    const onRangeChange = vi.fn()

    render(
      <ChartZoomControls
        data={chartData}
        range={{ startIndex: 0, endIndex: 99 }}
        onRangeChange={onRangeChange}
      />
    )

    expect(screen.getByText(/Showing 100 of 100 points/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom out horizontally' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Zoom in horizontally' }))

    expect(onRangeChange).toHaveBeenCalledWith({ startIndex: 20, endIndex: 79 })
  })
})

describe('chart power data', () => {
  it('uses authoritative total power instead of summing possibly stale modules', () => {
    const reading = {
      recordedAt: 0, inputWatts: 129, outputWatts: 80,
      acInputWatts: 103, dcInputWatts: 378, inputQuality: 'inconsistent' as const,
      acOutputWatts: 70, dcOutputWatts: 20, usbOutputWatts: 10,
    }
    expect(transformReadingsToChartData([reading])[0]).toMatchObject({
      totalInput: 129, totalOutput: 80, acInputWatts: undefined, dcInputWatts: undefined,
    })
  })

  it('leaves missing totals and legacy source attribution as gaps', () => {
    const reading = { recordedAt: 0, acInputWatts: 100, dcInputWatts: 200 }
    expect(transformReadingsToChartData([reading])[0]).toMatchObject({
      totalInput: undefined, totalOutput: undefined, acInputWatts: undefined, dcInputWatts: undefined,
    })
  })

  it('preserves a reported zero total when module diagnostics are nonzero', () => {
    const reading = {
      recordedAt: 0, inputWatts: 0, outputWatts: 0,
      acInputWatts: 500, dcInputWatts: 0, inputQuality: 'inconsistent' as const,
    }
    expect(transformReadingsToChartData([reading])[0]).toMatchObject({ totalInput: 0, totalOutput: 0 })
  })

  it('should retain separate raw panel watts and their receipt without fabricating station source zero', () => {
    const point = transformReadingsToChartData([{
      recordedAt: 0, inputWatts: 221, inputQuality: 'incomplete',
      powerMeasurement: 'pd-totals-mqtt-v1', solarPanelInputWatts: 226,
      solarPanelReceivedAt: 1_000, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    }])[0]
    expect(point).toMatchObject({
      inputWatts: 221, solarPanelInputWatts: 226, solarPanelReceivedAt: 1_000,
      acInputWatts: undefined, dcInputWatts: undefined,
    })
  })

  it('should keep missing panel points as gaps and preserve real raw panel zero', () => {
    const base: DeviceReading = {
      recordedAt: 0, powerMeasurement: 'pd-totals-mqtt-v1', solarPanelInputWatts: 226,
      solarPanelReceivedAt: 1_000, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    }
    const points = transformReadingsToChartData([
      base, { ...base, recordedAt: 60_000, solarPanelReceivedAt: null },
      { ...base, recordedAt: 120_000, solarPanelReceivedAt: 121_000, solarPanelInputWatts: 0 },
      { ...base, recordedAt: 180_000, solarPanelReceivedAt: 190_000 },
    ])
    expect(points.map(point => point.solarPanelInputWatts)).toEqual([226, undefined, 0, undefined])
  })

  it.each([0, 226])('should display an explicit bucket panel average with its own sample coverage (%sW)', average => {
    const point = transformReadingsToChartData([{
      recordedAt: 0, inputWatts: 221, inputQuality: 'incomplete',
      solarPanelInputWatts: null, solarPanelReceivedAt: null, solarPanelMeasurement: null,
      solarPanelAverageWatts: average, solarPanelSampleCount: 2, sampleCount: 20,
    }])[0]
    expect(point).toMatchObject({
      solarPanelInputWatts: average, solarPanelReceivedAt: undefined,
      solarPanelSampleCount: 2, sampleCount: 20,
      acInputWatts: undefined, dcInputWatts: undefined,
    })
  })

  it.each([
    { solarPanelAverageWatts: 226 },
    { solarPanelAverageWatts: 226, solarPanelSampleCount: 0, sampleCount: 20 },
    { solarPanelAverageWatts: 226, solarPanelSampleCount: 2.5, sampleCount: 20 },
    { solarPanelAverageWatts: 226, solarPanelSampleCount: 21, sampleCount: 20 },
    { solarPanelAverageWatts: NaN, solarPanelSampleCount: 2, sampleCount: 20 },
    { solarPanelAverageWatts: Infinity, solarPanelSampleCount: 2, sampleCount: 20 },
    { solarPanelAverageWatts: -1, solarPanelSampleCount: 2, sampleCount: 20 },
  ])('should not turn invalid bucket evidence into a panel measurement ($solarPanelAverageWatts W)', invalid => {
    expect(transformReadingsToChartData([{ recordedAt: 0, ...invalid }])[0].solarPanelInputWatts).toBeUndefined()
  })

  it('should keep a proven zero station source while rejecting nonfinite aggregate input', () => {
    const [measured, invalid] = transformReadingsToChartData([
      { recordedAt: 0, inputWatts: 0, acInputWatts: 0, dcInputWatts: 0, inputQuality: 'consistent', inputMeasurement: 'delta2-pd-mqtt-v1' },
      { recordedAt: 60_000, inputWatts: NaN },
    ])
    expect(measured).toMatchObject({ inputWatts: 0, acInputWatts: 0, dcInputWatts: 0 })
    expect(invalid.inputWatts).toBeUndefined()
  })
})

describe('panel chart tooltip evidence', () => {
  it('should show the actual receipt for an individual report, including measured zero', () => {
    render(<CustomTooltip active label="Test time" payload={[{
      name: 'Solar panels (separate measurement)', value: 0, unit: 'W', dataKey: (point: ChartDataPoint) => point.solarPanelInputWatts,
      payload: { timestamp: new Date(0).toISOString(), formattedTime: 'Test time', solarPanelReceivedAt: 1_000 },
    }]} />)
    expect(screen.getByText('Solar panels (separate measurement): 0W')).toBeInTheDocument()
    expect(screen.getByText(`Panel report received ${new Date(1_000).toLocaleString()}`)).toBeInTheDocument()
    expect(screen.queryByText(/Panel average:/)).not.toBeInTheDocument()
  })

  it('should disclose bucket sample coverage without claiming an individual sensor receipt', () => {
    render(<CustomTooltip active label="Hourly average" payload={[{
      name: 'Solar panels (separate measurement)', value: 226, unit: 'W', dataKey: 'solarPanelInputWatts',
      payload: {
        timestamp: new Date(0).toISOString(), formattedTime: 'Hourly average',
        solarPanelSampleCount: 2, sampleCount: 20,
      },
    }]} />)
    expect(screen.getByText('Panel average: 2 of 20 sampled readings')).toBeInTheDocument()
    expect(screen.queryByText(/Panel report received/)).not.toBeInTheDocument()
  })
})

describe('explicit panel chart gap bounds', () => {
  function panelPoint(minute: number, receiptOffset = 1_000): DeviceReading {
    const recordedAt = 10 * 3_600_000 + minute * 60_000
    return {
      recordedAt, inputWatts: 221, powerMeasurement: 'pd-totals-mqtt-v1',
      solarPanelInputWatts: 226, solarPanelReceivedAt: recordedAt + receiptOffset,
      solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    }
  }

  it('should break an actual offline gap with no intervening row while preserving every point and zoom index', () => {
    const readings = [0, 5, 120, 125].map(minute => panelPoint(minute))
    const data = transformReadingsToChartData(readings, { aggregation: 'raw', collectionIntervalMinutes: 5 })
    expect(data).toHaveLength(readings.length)
    expect(data.map(point => point.timestamp)).toEqual(readings.map(reading => new Date(Number(reading.recordedAt)).toISOString()))
    expect(data.map(point => point.solarPanelSegment)).toEqual([0, 0, 1, 1])
    expect(getSolarPanelSeries(data).map(series => data.map(series.value))).toEqual([
      [226, 226, undefined, undefined], [undefined, undefined, 226, 226],
    ])
    const zoomed = data.slice(1, 3)
    expect(getSolarPanelSeries(zoomed).map(series => zoomed.map(series.value))).toEqual([
      [226, undefined], [undefined, 226],
    ])
  })

  it('should use the actual panel receipts to decide whether a raw interval exceeds the bound', () => {
    const data = transformReadingsToChartData([panelPoint(0, 0), panelPoint(2, 5_000)], { aggregation: 'raw' })
    expect(data.map(point => point.solarPanelSegment)).toEqual([0, 1])
  })

  it('should allow an explicit sampling stride but not infer it from regularly sparse points', () => {
    const readings = [0, 3, 6, 20].map(minute => panelPoint(minute))
    const unknown = transformReadingsToChartData(readings, { aggregation: 'raw', collectionIntervalMinutes: null })
    expect(unknown.map(point => point.solarPanelSegment)).toEqual([0, 1, 2, 3])
    const sampled = transformReadingsToChartData(readings, {
      aggregation: 'raw', collectionIntervalMinutes: 1, samplingIntervalMs: 180_000,
    })
    expect(sampled.map(point => point.solarPanelSegment)).toEqual([0, 0, 0, 1])
  })

  it('should join regular known buckets while breaking a missing bucket without inventing sensor receipts', () => {
    const readings = [0, 1, 3, 4].map(hour => ({
      recordedAt: hour * 3_600_000, solarPanelAverageWatts: 226,
      solarPanelSampleCount: 2, sampleCount: 20,
    }))
    const data = transformReadingsToChartData(readings, { aggregation: '1h', collectionIntervalMinutes: 5 })
    expect(data.map(point => point.solarPanelSegment)).toEqual([0, 0, 1, 1])
    expect(data.every(point => point.solarPanelReceivedAt === undefined)).toBe(true)
    expect(data.every(point => point.solarPanelSampleCount === 2 && point.sampleCount === 20)).toBe(true)
  })

  it('should break duplicate or backward panel receipts instead of connecting them', () => {
    const duplicate = transformReadingsToChartData([panelPoint(0, 1_000), panelPoint(1 / 60, 0)])
    const backward = transformReadingsToChartData([panelPoint(0, 1_000), panelPoint(1 / 60, -500)])
    expect(duplicate.map(point => point.solarPanelSegment)).toEqual([0, 1])
    expect(backward.map(point => point.solarPanelSegment)).toEqual([0, 1])
  })

  it('should use one series for a normal bounded 500-point query and none for absent panel evidence', () => {
    const data = transformReadingsToChartData(Array.from({ length: 500 }, (_, index) => panelPoint(index)), {
      aggregation: 'raw', collectionIntervalMinutes: 1,
    })
    expect(data).toHaveLength(500)
    expect(getSolarPanelSeries(data)).toHaveLength(1)
    expect(getSolarPanelSeries(chartData)).toHaveLength(0)
  })
})

describe('historical temperature evidence', () => {
  const thermal = (recordedAt: number, temperature = 39): TemperatureHistoryReading => ({
    deviceId: 'station', deviceName: 'Test station', deviceSn: 'TEST', recordedAt, temperature,
    temperatureSampleCount: 1, temperatureMeasurement: 'bms-generic-mqtt-v1',
  })
  it('should leave missing temperatures as gaps and preserve actual zero measurements', () => {
    const temperatures = [null, undefined, NaN, Infinity, 0, 37];
    const data = transformReadingsToChartData(temperatures.map((temperature, index) => ({
      recordedAt: index * 60_000, temperature,
    })));
    expect(data.map(point => point.temperature)).toEqual([undefined, undefined, undefined, undefined, 0, 37]);
  });

  it('should explain an empty temperature series instead of drawing a zero axis', () => {
    render(<TemperatureChart data={chartData} />);
    expect(screen.getByText('No temperature measurements in this range.')).toBeInTheDocument();
    expect(screen.queryByText('0°C')).not.toBeInTheDocument();
  });

  it('should keep raw thermal receipt times and zero measurements without adding any PD/PV values', () => {
    const data = transformTemperatureReadingsToChartData([thermal(12_345, 0), thermal(312_345)], 'raw')
    expect(data.map(point => point.temperatureReceivedAt)).toEqual([12_345, 312_345])
    expect(data[0]).toMatchObject({ timestamp: new Date(12_345).toISOString(), temperature: 0, temperatureAverage: false })
    expect(data.every(point => point.inputWatts === undefined && point.solarPanelInputWatts === undefined)).toBe(true)
    expect(getTemperatureSeries(data)).toHaveLength(1)
  })

  it('should show observations as separate segments after a gap longer than six minutes', () => {
    const data = transformTemperatureReadingsToChartData([thermal(0), thermal(300_000), thermal(3_600_000)], 'raw')
    expect(data.map(point => point.temperatureSegment)).toEqual([0, 0, 1])
    const series = getTemperatureSeries(data)
    expect(series).toHaveLength(2)
    expect(data.map(series[0].value)).toEqual([39, 39, undefined])
    expect(data.map(series[1].value)).toEqual([undefined, undefined, 39])
  })

  it('should retain hourly average counts without inventing a report timestamp or bridging a missing bucket', () => {
    const data = transformTemperatureReadingsToChartData([0, 1, 3].map(hour => ({ ...thermal(hour * 3_600_000), temperatureSampleCount: 12 })), '1h')
    expect(data.map(point => point.temperatureSegment)).toEqual([0, 0, 1])
    expect(data.every(point => point.temperatureReceivedAt === undefined && point.temperatureAverage && point.temperatureSampleCount === 12)).toBe(true)
  })

  it('should break long gaps for existing callers that supply only the old chart data shape', () => {
    const data = [0, 300_000, 3_600_000].map(timestamp => ({ timestamp: new Date(timestamp).toISOString(), formattedTime: 'time', temperature: 39 }))
    const series = getTemperatureSeries(data)
    expect(series).toHaveLength(2)
    expect(data.map(series[0].value)).toEqual([39, 39, undefined])
  })

  it('should distinguish bucket averages from actual receipt timestamps in thermal tooltips', () => {
    const data = transformTemperatureReadingsToChartData([{ ...thermal(3_600_000), temperatureSampleCount: 12 }], '1h')
    render(<CustomTooltip active label="hour" payload={[{ name: 'Temperature', value: 39, unit: '°C', payload: data[0] }]} />)
    expect(screen.getByText('Average of 12 temperature readings in this bucket')).toBeInTheDocument()
    expect(screen.queryByText(/Temperature report received/)).not.toBeInTheDocument()
  })

  it('should switch a mounted chart to thermal-only data and restore the selected power-range tab on return', () => {
    const power = [{ timestamp: new Date(0).toISOString(), formattedTime: 'time', inputWatts: 300, batteryLevel: 70 }]
    const thermalData = transformTemperatureReadingsToChartData([thermal(123, 0)], 'raw')
    const { rerender } = render(<CombinedChart data={power} temperatureData={thermalData} />)
    expect(screen.getByRole('button', { name: /Power Usage/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Battery Level/ }))
    rerender(<CombinedChart data={[]} temperatureData={thermalData} defaultChart="temperature" />)
    expect(screen.getByRole('button', { name: /Temperature/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Power Usage/ })).toBeDisabled()
    expect(screen.queryByText('No temperature measurements in this range.')).not.toBeInTheDocument()
    rerender(<CombinedChart data={power} temperatureData={thermalData} />)
    expect(screen.getByRole('button', { name: /Battery Level/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Power Usage/ })).toBeEnabled()
  })
})
