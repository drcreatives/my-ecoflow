import { describe, expect, it } from 'vitest'
import type { DeviceReading, TemperatureHistoryReading } from './data-utils'
import { calculateEnergyTotals } from './analytics'
import { mergeTemperatureHistoryReadings, selectTemperatureHistoryWindow } from './temperature-history'

function observation(recordedAt: number, temperature = 39, deviceId = 'station'): TemperatureHistoryReading {
  return { deviceId, deviceName: 'Test station', deviceSn: 'TEST', temperature, recordedAt,
    temperatureSampleCount: 1, temperatureMeasurement: 'bms-generic-mqtt-v1' }
}

describe('independent historical temperature display rows', () => {
  it('shows thermal observations even when all power temperatures are missing, preserving the source arrays', () => {
    const power: DeviceReading[] = [{ deviceId: 'station', recordedAt: 1_000, temperature: null, inputWatts: 350, outputWatts: 200 }]
    const thermal = [observation(2_345)]
    const before = JSON.stringify([power, thermal])
    const rows = mergeTemperatureHistoryReadings(power, thermal)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ recordedAt: 1_000, temperature: null, inputWatts: 350 })
    expect(rows[1]).toMatchObject({ recordedAt: 2_345, temperature: 39, readingKind: 'temperature', status: 'Temperature observation' })
    expect(JSON.stringify([power, thermal])).toBe(before)
  })

  it('keeps thermal-only power, source, battery and status measurements unavailable', () => {
    const row = mergeTemperatureHistoryReadings([], [observation(123, 0)])[0]
    expect(row.temperature).toBe(0)
    for (const field of ['batteryLevel', 'inputWatts', 'acInputWatts', 'dcInputWatts', 'solarInputWatts',
      'outputWatts', 'acOutputWatts', 'dcOutputWatts', 'usbOutputWatts', 'powerMeasurement', 'inputMeasurement']) {
      expect(row[field as keyof typeof row]).toBeNull()
    }
    expect(row.recordedAt).toBe(123)
  })

  it('overlays a matching aggregate bucket without losing PD/PV data or counting another row', () => {
    const power: DeviceReading[] = [{ deviceId: 'station', recordedAt: 3_600_000, inputWatts: 300,
      solarPanelAverageWatts: 305, solarPanelSampleCount: 20, sampleCount: 20 }]
    const thermal = [{ ...observation(3_600_000, 38), temperatureSampleCount: 12 }]
    expect(mergeTemperatureHistoryReadings(power, thermal)).toEqual([{
      ...power[0], temperature: 38, temperatureSampleCount: 12, temperatureMeasurement: 'bms-generic-mqtt-v1',
    }])
  })

  it('deduplicates a legacy raw temperature at the exact same device/time and retains real zero', () => {
    const power = [{ deviceId: 'station', recordedAt: 4_567, temperature: 0, inputWatts: 0 }]
    const thermal = [observation(4_567, 0), observation(4_567, 0)]
    const rows = mergeTemperatureHistoryReadings(power, thermal)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ temperature: 0, inputWatts: 0, temperatureSampleCount: 1 })
    expect(rows[0].readingKind).toBeUndefined()
  })

  it('does not merge observations from different devices sharing a timestamp', () => {
    const rows = mergeTemperatureHistoryReadings([{ deviceId: 'station', recordedAt: 100 }], [observation(100, 39, 'other')])
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.deviceId)).toEqual(['station', 'other'])
  })

  it('ignores nonfinite measurements or receipts and orders valid observations chronologically', () => {
    expect(mergeTemperatureHistoryReadings([], [observation(200), observation(NaN), observation(100, 0), observation(300, Infinity)]))
      .toMatchObject([{ recordedAt: 100, temperature: 0 }, { recordedAt: 200, temperature: 39 }])
  })

  it('leaves existing verified PV energy unchanged when independent display rows are built', () => {
    const power = [0, 60_000].map(recordedAt => ({ deviceId: 'station', recordedAt,
      inputWatts: 300, acInputWatts: null, dcInputWatts: null, outputWatts: 200, powerMeasurement: 'pd-totals-mqtt-v1' as const,
      solarPanelInputWatts: 305, solarPanelReceivedAt: recordedAt, solarPanelMeasurement: 'delta2-mppt-mqtt-v1' as const }))
    const before = calculateEnergyTotals(power, 'raw')
    mergeTemperatureHistoryReadings(power, [observation(30_000)])
    expect(calculateEnergyTotals(power, 'raw')).toEqual(before)
    expect(before.solarPanelInput).toBeGreaterThan(0)
  })
})

describe('independent thermal chart time window', () => {
  const points = [0, 1, 2, 3, 4].map(hour => ({ timestamp: new Date(hour * 3_600_000).toISOString() }))
  it('preserves the selected power zoom bounds without using thermal indexes', () => {
    expect(selectTemperatureHistoryWindow(points, points, { startIndex: 1, endIndex: 3 })).toEqual(points.slice(1, 4))
  })

  it('includes the full selected final average bucket and retains thermal-only/full ranges', () => {
    expect(selectTemperatureHistoryWindow(points, points, { startIndex: 1, endIndex: 2 }, 3_600_000)).toEqual(points.slice(1, 3))
    expect(selectTemperatureHistoryWindow(points, [], { startIndex: 0, endIndex: 0 })).toEqual(points)
    expect(selectTemperatureHistoryWindow(points, points.slice(1, 4), { startIndex: 0, endIndex: 2 })).toEqual(points)
  })
})
