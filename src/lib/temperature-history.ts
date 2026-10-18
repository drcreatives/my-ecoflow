import type { DeviceReading, TemperatureHistoryReading } from '@/lib/data-utils'

export interface TemperatureTableReading extends DeviceReading {
  deviceName?: string
  deviceSn?: string
}

/** Combine display rows only; these rows must never feed power/source calculations. */
export function mergeTemperatureHistoryReadings(
  powerReadings: readonly TemperatureTableReading[],
  temperatureReadings: readonly TemperatureHistoryReading[] = [],
): TemperatureTableReading[] {
  const rows = powerReadings.map(reading => ({ ...reading }))
  const byReceipt = new Map(rows.map((reading, index) => [
    `${reading.deviceId ?? ''}:${new Date(reading.recordedAt).getTime()}`, index,
  ]))
  const seenTemperatures = new Set<string>()
  for (const observation of temperatureReadings) {
    if (!Number.isFinite(observation.temperature) || !Number.isFinite(observation.recordedAt)) continue
    const key = `${observation.deviceId}:${observation.recordedAt}`
    if (seenTemperatures.has(key)) continue
    seenTemperatures.add(key)
    const temperatureFields = {
      temperature: observation.temperature,
      temperatureSampleCount: observation.temperatureSampleCount,
      temperatureMeasurement: observation.temperatureMeasurement,
    }
    const index = byReceipt.get(key)
    if (index !== undefined) {
      rows[index] = { ...rows[index], ...temperatureFields }
    } else {
      byReceipt.set(key, rows.length)
      rows.push({
        deviceId: observation.deviceId, deviceName: observation.deviceName, deviceSn: observation.deviceSn,
        recordedAt: observation.recordedAt, readingKind: 'temperature', ...temperatureFields,
        batteryLevel: null, inputWatts: null, acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
        chargingType: null, chargingTypeSource: null, inputQuality: null, inputMeasurement: null,
        powerMeasurement: null, solarPanelInputWatts: null, solarPanelReceivedAt: null, solarPanelMeasurement: null,
        outputWatts: null, acOutputWatts: null, dcOutputWatts: null, usbOutputWatts: null,
        remainingTime: null, status: 'Temperature observation',
      })
    }
  }
  return rows.sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime())
}

/** Keep the thermal stream inside the selected power-chart time window. */
export function selectTemperatureHistoryWindow<T extends { timestamp: string }>(
  temperatures: readonly T[],
  powerData: readonly { timestamp: string }[],
  range: { startIndex: number; endIndex: number },
  bucketWidthMs = 0,
): T[] {
  if (!powerData.length) return [...temperatures]
  const startIndex = Math.max(0, Math.min(range.startIndex, powerData.length - 1))
  const endIndex = Math.max(startIndex, Math.min(range.endIndex, powerData.length - 1))
  // A full-range view retains temperatures preceding/following the available PD samples.
  if (startIndex === 0 && endIndex === powerData.length - 1) return [...temperatures]
  const start = new Date(powerData[startIndex].timestamp).getTime()
  const end = new Date(powerData[endIndex].timestamp).getTime() + bucketWidthMs
  return temperatures.filter(point => {
    const receivedAt = new Date(point.timestamp).getTime()
    return receivedAt >= start && (bucketWidthMs > 0 ? receivedAt < end : receivedAt <= end)
  })
}
