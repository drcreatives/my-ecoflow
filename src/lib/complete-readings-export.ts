export const COMPLETE_READING_COLUMNS = [
  'deviceSn', 'deviceName', 'recordedAt', 'batteryLevel', 'inputWatts', 'outputWatts',
  'acInputWatts', 'dcInputWatts', 'solarInputWatts', 'chargingType', 'chargingTypeSource',
  'inputQuality', 'inputMeasurement', 'powerMeasurement', 'solarPanelInputWatts',
  'solarPanelReceivedAt', 'solarPanelMeasurement', 'acOutputWatts', 'dcOutputWatts', 'usbOutputWatts',
  'remainingTime', 'temperature', 'status', 'acEnabled', 'dcOutEnabled', 'carChargerEnabled',
  'acXboost', 'acOutVoltage', 'acOutFrequency', 'acChargingWatts', 'acChargingPaused',
  'dcChargingCurrent', 'acStandbyMins', 'carStandbyMins', 'unitStandbyMins', 'maxChargeSoc',
  'minDischargeSoc', 'solarPriority', 'energyMgmtEnabled', 'backupReserveSoc',
  'acAutoOutEnabled', 'minAcOutSoc', 'smartGenOnSoc', 'smartGenOffSoc', 'lcdOffSeconds', 'buzzerSilent',
  'readingKind', 'temperatureMeasurement',
] as const

type ReadingColumn = typeof COMPLETE_READING_COLUMNS[number]
type ReadingScalar = string | number | boolean | null
export type CompleteExportReading = { recordedAt: number } & Partial<
  Record<Exclude<ReadingColumn, 'recordedAt'>, ReadingScalar>
>

interface ReadingPage<T> {
  page: T[]
  isDone: boolean
  continueCursor: string
  available?: boolean
}

export interface CompleteExportWindow {
  endTime: number
  deletionRevision: number
}

/** Fetch every page for each owned device against one fixed export boundary. */
export async function collectCompleteReadings<T, DeviceId extends string>(
  deviceIds: readonly DeviceId[],
  window: CompleteExportWindow,
  readPage: (args: { deviceId: DeviceId; cursor: string | null; endTime: number; deletionRevision: number }) => Promise<ReadingPage<T>>,
): Promise<T[]> {
  const { endTime, deletionRevision } = window
  if (!Number.isSafeInteger(endTime) || endTime < 0 ||
      !Number.isSafeInteger(deletionRevision) || deletionRevision < 0) {
    throw new Error('Reading export stopped because its consistency window is invalid. Please try again.')
  }
  const readings: T[] = []
  for (const deviceId of deviceIds) {
    let cursor: string | null = null
    const seenCursors = new Set<string>()
    while (true) {
      const result = await readPage({ deviceId, cursor, endTime, deletionRevision })
      if (result.available === false) {
        throw new Error('Reading export stopped because device access changed. Please sign in and try again.')
      }
      readings.push(...result.page)
      if (result.isDone) break
      if (!result.continueCursor || seenCursors.has(result.continueCursor)) {
        throw new Error('Reading export stopped because pagination did not advance. Please try again.')
      }
      seenCursors.add(result.continueCursor)
      cursor = result.continueCursor
    }
  }
  return readings
}

/** Match the backend's deliberate scalar projection and use portable timestamps. */
export function createCompleteExportReadings(readings: readonly CompleteExportReading[]) {
  return readings.map(reading => Object.fromEntries(COMPLETE_READING_COLUMNS.map(column => [
    column,
    column === 'recordedAt' ? new Date(reading.recordedAt).toISOString() : reading[column] ?? null,
  ] as const)))
}

export function createCompleteReadingsCsv(readings: readonly CompleteExportReading[]): string {
  const rows = createCompleteExportReadings(readings).map(reading => COMPLETE_READING_COLUMNS.map(column =>
    `"${String(reading[column] ?? '').replace(/"/g, '""')}"`
  ).join(','))
  return [COMPLETE_READING_COLUMNS.join(','), ...rows].join('\n')
}
