import { describe, expect, it } from 'vitest'
import { getConfirmedSolarInputWatts, getInputLabel, getInputSourceDescription, getReadingFreshness, getReadingStaleAt, getTrustedInputChannels, getVerifiedSolarPanelInput, type InputSourceReading } from './reading-status'

describe('input source labels', () => {
  const solar = {
    inputWatts: 200, acInputWatts: 0, dcInputWatts: 200,
    chargingType: 2, inputQuality: 'consistent' as const,
    inputMeasurement: 'delta2-pd-mqtt-v1' as const, solarInputWatts: 200,
  }

  it('uses measured DC instead of a stale AC charging flag', () => {
    expect(getInputLabel({ ...solar, chargingType: 3, solarInputWatts: null })).toBe('DC Input')
    expect(getInputLabel(solar)).toBe('Solar Input')
  })

  it('labels simultaneous AC and solar without hiding either channel', () => {
    expect(getInputLabel({ ...solar, inputWatts: 300, acInputWatts: 100 })).toBe('AC + Solar Input')
    expect(getInputLabel({ ...solar, inputWatts: 300, acInputWatts: 100, chargingType: 1, solarInputWatts: 0 })).toBe('AC + DC Input')
  })

  it('does not use the solar flag to override measured AC input', () => {
    expect(getInputLabel({ ...solar, acInputWatts: 200, dcInputWatts: 0 })).toBe('AC Input')
  })

  it('does not attribute inconsistent, incomplete, or legacy telemetry', () => {
    expect(getInputLabel({ ...solar, inputQuality: 'inconsistent' })).toBe('Input (source unknown)')
    expect(getInputLabel({ ...solar, inputQuality: 'incomplete' })).toBe('Input (source unknown)')
    expect(getInputLabel({ ...solar, inputQuality: undefined })).toBe('Input (source unknown)')
    expect(getTrustedInputChannels({ ...solar, inputWatts: 100 })).toBeNull()
    expect(getTrustedInputChannels({ ...solar, dcInputWatts: null })).toBeNull()
  })

  it('retains a reported zero aggregate without inferring a charging source', () => {
    expect(getInputLabel({ ...solar, inputWatts: 0 })).toBe('Input')
  })

  it.each([undefined, null, 'legacy-modules', 'delta2-pd-v1'] as const)(
    'does not trust coherent cached or legacy channels without live source proof (%s)', inputMeasurement => {
      const reading = { ...solar, inputMeasurement }
      const before = JSON.stringify(reading)
      expect(getTrustedInputChannels(reading)).toBeNull()
      expect(getConfirmedSolarInputWatts(reading)).toBeNull()
      expect(getInputLabel(reading)).toBe('Input (source unknown)')
      expect(JSON.stringify(reading)).toBe(before)
    },
  )

  it('does not interpret an unproven aggregate bucket or a subtype flag as live solar proof', () => {
    expect(getTrustedInputChannels({ ...solar, inputMeasurement: null })).toBeNull()
    expect(getConfirmedSolarInputWatts({ ...solar, solarInputWatts: null })).toBeNull()
    expect(getInputLabel({ ...solar, solarInputWatts: null })).toBe('DC Input')
  })

  it('labels new same-PD AC and solar readings and preserves solar inside a mixed bucket', () => {
    const measured = { ...solar, solarInputWatts: 200 }
    expect(getInputLabel({ ...measured, acInputWatts: 200, dcInputWatts: 0, solarInputWatts: 0, chargingType: 0 })).toBe('AC Input')
    expect(getInputLabel(measured)).toBe('Solar Input')
    expect(getInputLabel({ ...measured, acInputWatts: 100, dcInputWatts: 100, solarInputWatts: 100, chargingType: null })).toBe('AC + Solar Input')
    expect(getInputLabel({ ...measured, solarInputWatts: 100, chargingType: null })).toBe('Solar + DC Input')
  })

  it('requires finite bounded solar evidence and never repairs a legacy or unknown-PD source', () => {
    for (const solarInputWatts of [NaN, Infinity, -1, 201]) {
      expect(getConfirmedSolarInputWatts({ ...solar, solarInputWatts })).toBeNull()
    }
    expect(getConfirmedSolarInputWatts({ ...solar, inputMeasurement: 'delta2-pd-v1', solarInputWatts: null })).toBeNull()
    expect(getConfirmedSolarInputWatts({ ...solar, inputMeasurement: 'delta2-pd-mqtt-v1', solarInputWatts: null })).toBeNull()
    expect(getConfirmedSolarInputWatts({ ...solar, inputMeasurement: 'delta2-pd-mqtt-v1', solarInputWatts: 200 })).toBe(200)
    expect(getInputLabel({ ...solar, inputMeasurement: 'delta2-pd-v1', solarInputWatts: null })).toBe('Input (source unknown)')
    expect(getConfirmedSolarInputWatts({ ...solar, inputQuality: undefined, solarInputWatts: 200 })).toBeNull()
    expect(getConfirmedSolarInputWatts({ ...solar, inputQuality: 'inconsistent', solarInputWatts: 200 })).toBeNull()
  })
})

describe('independent panel input evidence', () => {
  const panels: InputSourceReading = {
    inputWatts: 221, acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
    inputQuality: 'incomplete', powerMeasurement: 'pd-totals-mqtt-v1',
    solarPanelInputWatts: 226, solarPanelReceivedAt: 1_000, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
  }

  it('should identify active solar without turning greater panel watts into station source allocation', () => {
    expect(getVerifiedSolarPanelInput(panels)).toEqual({ watts: 226, receivedAt: 1_000 })
    expect(getInputLabel(panels)).toBe('Solar active')
    expect(getTrustedInputChannels(panels)).toBeNull()
    expect(getConfirmedSolarInputWatts(panels)).toBeNull()
    expect(getInputSourceDescription(panels)).toContain('AC/DC split unavailable.')
    expect(getInputSourceDescription(panels)).toContain('Panels: 226W')
    expect(getInputSourceDescription(panels)).toContain(new Date(1_000).toLocaleString())
    expect(getInputSourceDescription(panels)).toContain('separately from the station input total')
  })

  it('should retain established complete AC and solar station labels', () => {
    const complete: InputSourceReading = { ...panels, inputQuality: 'consistent', inputMeasurement: 'delta2-pd-mqtt-v1', acInputWatts: 221, dcInputWatts: 0, solarInputWatts: 0 }
    expect(getInputLabel(complete)).toBe('AC Input')
    expect(getInputSourceDescription(complete)).not.toContain('AC/DC split unavailable')
    expect(getInputLabel({ ...complete, acInputWatts: 0, dcInputWatts: 221, solarInputWatts: 221 })).toBe('Solar Input')
  })

  it('should reject incomplete, invalid, or averaged panel evidence', () => {
    const invalid: Partial<InputSourceReading>[] = [
      { powerMeasurement: null }, { solarPanelMeasurement: null }, { solarPanelInputWatts: null },
      { solarPanelInputWatts: -1 }, { solarPanelInputWatts: NaN }, { solarPanelInputWatts: Infinity },
      { solarPanelReceivedAt: null }, { solarPanelReceivedAt: NaN }, { solarPanelReceivedAt: Infinity },
      { solarPanelReceivedAt: -1 }, { solarPanelReceivedAt: 1e100 },
    ]
    for (const missing of invalid) {
      expect(getVerifiedSolarPanelInput({ ...panels, ...missing })).toBeNull()
      expect(getInputLabel({ ...panels, ...missing })).toBe('Input (source unknown)')
    }
  })

  it('should preserve verified zero panel power without claiming active solar', () => {
    expect(getVerifiedSolarPanelInput({ ...panels, solarPanelInputWatts: 0 })).toEqual({ watts: 0, receivedAt: 1_000 })
    expect(getInputLabel({ ...panels, solarPanelInputWatts: 0 })).toBe('Input (source unknown)')
    expect(getInputLabel({ inputWatts: 221, inputQuality: 'incomplete' })).toBe('Input (source unknown)')
    expect(getInputSourceDescription({ inputWatts: 221 })).toBeUndefined()
  })
})

describe('reading freshness', () => {
  const now = 20 * 60_000

  it('honors the configured collection interval and cron grace', () => {
    expect(getReadingFreshness(now - 6 * 60_000, 5, now)).toBe('recent')
    expect(getReadingFreshness(now - 8 * 60_000, 5, now)).toBe('stale')
    expect(getReadingFreshness(now - 8 * 60_000, 10, now)).toBe('recent')
  })

  it('reports missing or invalid timestamps separately from old readings', () => {
    expect(getReadingFreshness(null, 5, now)).toBe('missing')
    expect(getReadingFreshness('invalid', 5, now)).toBe('missing')
    expect(getReadingFreshness(new Date(0), 5, now)).toBe('stale')
  })

  it('provides one expiry timestamp for a UI freshness update without polling', () => {
    expect(getReadingStaleAt(new Date(0), 5)).toBe(7 * 60_000)
    expect(getReadingStaleAt('1970-01-01T00:00:00.000Z', 10)).toBe(12 * 60_000)
    expect(getReadingStaleAt('invalid', 5)).toBeNull()
  })
})
