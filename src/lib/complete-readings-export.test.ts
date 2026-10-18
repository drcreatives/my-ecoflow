import { describe, expect, it, vi } from 'vitest'
import { collectCompleteReadings, createCompleteExportReadings, createCompleteReadingsCsv } from './complete-readings-export'

describe('complete readings export', () => {
  it('should export independent thermal observations at their actual receipt with blank power cells', () => {
    const reading = { recordedAt: 1_000, readingKind: 'temperature', temperatureMeasurement: 'bms-generic-mqtt-v1', temperature: 0 }
    const [json] = createCompleteExportReadings([reading])
    expect(json).toMatchObject({ ...reading, recordedAt: new Date(1_000).toISOString(), batteryLevel: null, inputWatts: null, outputWatts: null, acInputWatts: null, dcInputWatts: null, solarInputWatts: null, powerMeasurement: null })
    const [headers, row] = createCompleteReadingsCsv([reading]).split('\n').map(line => line.split(','))
    expect(Object.fromEntries(headers.map((header, index) => [header, row[index]]))).toMatchObject({ readingKind: '"temperature"', temperatureMeasurement: '"bms-generic-mqtt-v1"', temperature: '"0"', inputWatts: '""', acInputWatts: '""', dcInputWatts: '""', outputWatts: '""' })
    expect(createCompleteExportReadings([{ recordedAt: 0 }])[0]).toMatchObject({ readingKind: null, temperatureMeasurement: null })
  })

  it.each([0, 226])('should preserve independent panel evidence without allocating it to station solar (%sW)', solarPanelInputWatts => {
    const reading = {
      recordedAt: 1_000, inputWatts: 221, acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
      powerMeasurement: 'pd-totals-mqtt-v1', solarPanelInputWatts,
      solarPanelReceivedAt: 1_003, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    }
    expect(createCompleteExportReadings([reading])[0]).toMatchObject({ ...reading, recordedAt: new Date(1_000).toISOString() })
    const [headers, row] = createCompleteReadingsCsv([reading]).split('\n').map(line => line.split(','))
    expect(Object.fromEntries(headers.map((header, index) => [header, row[index]]))).toMatchObject({
      inputWatts: '"221"', acInputWatts: '""', dcInputWatts: '""', solarInputWatts: '""',
      powerMeasurement: '"pd-totals-mqtt-v1"', solarPanelInputWatts: `"${solarPanelInputWatts}"`,
      solarPanelReceivedAt: '"1003"', solarPanelMeasurement: '"delta2-mppt-mqtt-v1"',
    })
  })

  it('should leave all new fields unavailable for older complete-export rows', () => {
    const [reading] = createCompleteExportReadings([{ recordedAt: 0 }])
    expect(reading).toMatchObject({ powerMeasurement: null, solarPanelInputWatts: null, solarPanelReceivedAt: null, solarPanelMeasurement: null })
  })

  it('should retain every page and device, including readings with equal timestamps', async () => {
    const rows = [
      { recordedAt: 0, batteryLevel: 25 },
      { recordedAt: 0, batteryLevel: 26 },
      { recordedAt: 1_000, batteryLevel: 90 },
    ]
    const readPage = vi.fn()
      .mockResolvedValueOnce({ page: [rows[0]], isDone: false, continueCursor: 'device-a-next' })
      .mockResolvedValueOnce({ page: [rows[1]], isDone: true, continueCursor: '' })
      .mockResolvedValueOnce({ page: [rows[2]], isDone: true, continueCursor: '' })

    expect(await collectCompleteReadings(['device-a', 'device-b'], { endTime: 10_000, deletionRevision: 7 }, readPage)).toEqual(rows)
    expect(readPage.mock.calls.map(([args]) => args)).toEqual([
      { deviceId: 'device-a', cursor: null, endTime: 10_000, deletionRevision: 7 },
      { deviceId: 'device-a', cursor: 'device-a-next', endTime: 10_000, deletionRevision: 7 },
      { deviceId: 'device-b', cursor: null, endTime: 10_000, deletionRevision: 7 },
    ])
  })

  it('should continue through an empty page when the cursor advances', async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce({ page: [], isDone: false, continueCursor: 'next' })
      .mockResolvedValueOnce({ page: [{ recordedAt: 0 }], isDone: true, continueCursor: '' })
    expect(await collectCompleteReadings(['device-a'], { endTime: 10_000, deletionRevision: 0 }, readPage)).toEqual([{ recordedAt: 0 }])
  })

  it.each(['', 'same'])('should reject incomplete pagination without an advancing cursor (%j)', async cursor => {
    const readPage = vi.fn().mockResolvedValue({ page: [], isDone: false, continueCursor: cursor })
    await expect(collectCompleteReadings(['device-a'], { endTime: 10_000, deletionRevision: 0 }, readPage)).rejects.toThrow('pagination did not advance')
    expect(readPage.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('should reject a partial export when device access is lost between pages', async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce({ page: [{ recordedAt: 0 }], isDone: false, continueCursor: 'next', available: true })
      .mockResolvedValueOnce({ page: [], isDone: true, continueCursor: '', available: false })
    await expect(collectCompleteReadings(['device-a'], { endTime: 10_000, deletionRevision: 0 }, readPage)).rejects.toThrow('device access changed')
  })

  it.each(['another-page', 'another-device'])('should reject a partial export when cleanup changes readings before %s', async boundary => {
    const readPage = vi.fn()
      .mockResolvedValueOnce({ page: [{ recordedAt: 0 }], isDone: boundary === 'another-device', continueCursor: 'next' })
      .mockRejectedValueOnce(new Error('Reading export stopped because retention cleanup changed the stored readings. Please export again.'))
    await expect(collectCompleteReadings(['device-a', 'device-b'], { endTime: 10_000, deletionRevision: 3 }, readPage)).rejects.toThrow('retention cleanup changed')
    expect(readPage.mock.calls.map(([args]) => args.deletionRevision)).toEqual([3, 3])
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('should fail before fetching for an invalid consistency revision (%s)', async deletionRevision => {
    const readPage = vi.fn()
    await expect(collectCompleteReadings(['device-a'], { endTime: 10_000, deletionRevision }, readPage)).rejects.toThrow('consistency window is invalid')
    expect(readPage).not.toHaveBeenCalled()
  })

  it('should retain the original consistency window even if the caller mutates its object during pagination', async () => {
    const snapshot = { endTime: 10_000, deletionRevision: 3 }
    const readPage = vi.fn()
      .mockImplementationOnce(async () => {
        snapshot.endTime = 20_000
        snapshot.deletionRevision = 4
        return { page: [], isDone: false, continueCursor: 'next' }
      })
      .mockResolvedValueOnce({ page: [], isDone: true, continueCursor: '' })
    await collectCompleteReadings(['device-a'], snapshot, readPage)
    expect(readPage.mock.calls.map(([args]) => args)).toEqual([
      { deviceId: 'device-a', cursor: null, endTime: 10_000, deletionRevision: 3 },
      { deviceId: 'device-a', cursor: 'next', endTime: 10_000, deletionRevision: 3 },
    ])
  })

  it('should preserve telemetry, configuration and provenance in JSON and CSV', () => {
    const readings = [{
      deviceSn: 'TEST-STATION', deviceName: 'Station "A", upstairs', recordedAt: 0,
      inputWatts: 0, solarInputWatts: 0, inputMeasurement: 'delta2-pd-mqtt-v1',
      chargingTypeSource: 'live-pd', inputQuality: 'incomplete',
      acEnabled: false, buzzerSilent: false, acChargingPaused: true, backupReserveSoc: 20,
      temperature: null, status: null,
    }]
    const [json] = createCompleteExportReadings(readings)
    expect(json).toMatchObject({ ...readings[0], recordedAt: '1970-01-01T00:00:00.000Z' })
    expect(json.dcInputWatts).toBeNull()
    const csv = createCompleteReadingsCsv(readings)
    expect(csv).toContain('"Station ""A"", upstairs"')
    const [headers, row] = createCompleteReadingsCsv([{ ...readings[0], deviceName: 'Station A' }])
      .split('\n').map(line => line.split(','))
    expect(Object.fromEntries(headers.map((header, index) => [header, row[index]]))).toMatchObject({
      recordedAt: '"1970-01-01T00:00:00.000Z"',
      inputWatts: '"0"', solarInputWatts: '"0"', inputMeasurement: '"delta2-pd-mqtt-v1"',
      chargingTypeSource: '"live-pd"', inputQuality: '"incomplete"', acEnabled: '"false"',
      buzzerSilent: '"false"', acChargingPaused: '"true"', backupReserveSoc: '"20"',
      temperature: '""', status: '""',
    })
  })
})
