export type InputQuality = 'consistent' | 'inconsistent' | 'incomplete'
export type ReadingFreshness = 'missing' | 'recent' | 'stale'

export interface InputSourceReading {
  inputWatts?: number | null
  acInputWatts?: number | null
  dcInputWatts?: number | null
  chargingType?: number | null
  inputQuality?: InputQuality | null
  inputMeasurement?: 'delta2-pd-v1' | 'delta2-pd-mqtt-v1' | 'legacy-modules' | null
  solarInputWatts?: number | null
  powerMeasurement?: 'pd-totals-mqtt-v1' | null
  solarPanelInputWatts?: number | null
  solarPanelReceivedAt?: number | null
  solarPanelMeasurement?: 'delta2-mppt-mqtt-v1' | null
}

function isPower(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Coherent channels require live transport proof; cached agreement is diagnostic. */
export function getTrustedInputChannels(reading?: InputSourceReading | null): {
  acInputWatts: number
  dcInputWatts: number
} | null {
  if (!reading || reading.inputQuality !== 'consistent' ||
    reading.inputMeasurement !== 'delta2-pd-mqtt-v1') return null
  const { inputWatts, acInputWatts, dcInputWatts } = reading
  if (!isPower(inputWatts) || !isPower(acInputWatts) || !isPower(dcInputWatts)) return null
  const tolerance = Math.max(10, inputWatts * 0.05)
  if (Math.abs(acInputWatts + dcInputWatts - inputWatts) > tolerance) return null
  return { acInputWatts, dcInputWatts }
}

export function getInputLabel(reading?: InputSourceReading | null): string {
  const channels = getTrustedInputChannels(reading)
  if (!channels) {
    const panels = getVerifiedSolarPanelInput(reading)
    if (panels && panels.watts > 0) return 'Solar active'
    return reading?.inputWatts === 0 ? 'Input' : 'Input (source unknown)'
  }
  if (reading?.inputWatts === 0) return 'Input'
  const hasAc = channels.acInputWatts > 0
  const hasDc = channels.dcInputWatts > 0
  const solarWatts = getConfirmedSolarInputWatts(reading)
  const dcLabel = solarWatts !== null && solarWatts > 0
    ? (Math.abs(solarWatts - channels.dcInputWatts) < 0.01 ? 'Solar' : 'Solar + DC')
    : 'DC'
  if (hasAc && hasDc) return `AC + ${dcLabel} Input`
  if (hasAc) return 'AC Input'
  if (hasDc) return `${dcLabel} Input`
  return 'Input (source unknown)'
}

/** Independent PV evidence is for display; never allocate it to station channels. */
export function getVerifiedSolarPanelInput(reading?: InputSourceReading | null): {
  watts: number
  receivedAt: number
} | null {
  if (reading?.powerMeasurement !== 'pd-totals-mqtt-v1' ||
    reading.solarPanelMeasurement !== 'delta2-mppt-mqtt-v1' ||
    !isPower(reading.solarPanelInputWatts) ||
    typeof reading.solarPanelReceivedAt !== 'number' || !Number.isFinite(reading.solarPanelReceivedAt) ||
    reading.solarPanelReceivedAt < 0 || Number.isNaN(new Date(reading.solarPanelReceivedAt).getTime())) return null
  return { watts: reading.solarPanelInputWatts, receivedAt: reading.solarPanelReceivedAt }
}

export function getInputSourceDescription(reading?: InputSourceReading | null): string | undefined {
  const panels = getVerifiedSolarPanelInput(reading)
  if (!panels) return undefined
  const split = getTrustedInputChannels(reading) ? '' : 'AC/DC split unavailable. '
  return `${split}Panels: ${panels.watts.toFixed(0)}W, received ${new Date(panels.receivedAt).toLocaleString()}. Panel input is measured separately from the station input total.`
}

/** Confirmed solar survives aggregation even when a bucket contains AC and solar. */
export function getConfirmedSolarInputWatts(reading?: InputSourceReading | null): number | null {
  const channels = getTrustedInputChannels(reading)
  if (!reading || !channels) return null
  if (reading.solarInputWatts != null) {
    return isPower(reading.solarInputWatts) && reading.solarInputWatts <= channels.dcInputWatts
      ? reading.solarInputWatts : null
  }
  // Source subtype flags alone cannot establish a measured solar contribution.
  return null
}

export function getReadingStaleAt(
  recordedAt?: number | Date | string | null,
  collectionIntervalMinutes = 5
): number | null {
  if (recordedAt == null) return null
  const timestamp = recordedAt instanceof Date
    ? recordedAt.getTime()
    : typeof recordedAt === 'number' ? recordedAt : new Date(recordedAt).getTime()
  if (!Number.isFinite(timestamp)) return null
  const interval = Number.isFinite(collectionIntervalMinutes) && collectionIntervalMinutes > 0
    ? collectionIntervalMinutes : 5
  const graceMs = Math.max(2, interval + 2) * 60_000
  return timestamp + graceMs
}

/** Evaluate on reactive updates/navigation; collection remains server-side. */
export function getReadingFreshness(
  recordedAt?: number | Date | string | null,
  collectionIntervalMinutes = 5,
  now = Date.now()
): ReadingFreshness {
  const staleAt = getReadingStaleAt(recordedAt, collectionIntervalMinutes)
  if (staleAt === null) return 'missing'
  return now > staleAt ? 'stale' : 'recent'
}
