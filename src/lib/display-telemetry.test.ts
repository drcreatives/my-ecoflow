import { describe, expect, it } from 'vitest'
import { getTemperatureAge, resolveDisplayMetric, resolveTemperatureMetric, TEMPERATURE_FRESHNESS_MS } from './display-telemetry'

const receivedAt = Date.parse('2026-10-18T01:00:00Z')

describe('display telemetry fallback', () => {
  it.each([0, 24])('should preserve a finite current value (%s) without a cached label', current => {
    expect(resolveDisplayMetric(current, { value: 99, receivedAt, source: 'rest-cache' }))
      .toEqual({ value: current, cacheLabel: null })
  })

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY])('should qualify an older live value when the current value is unavailable (%s)', current => {
    expect(resolveDisplayMetric(current, { value: 24, receivedAt, source: 'mqtt' })).toEqual({
      value: 24,
      cacheLabel: `Last reported ${new Date(receivedAt).toLocaleString()}`,
      cacheTooltip: `Live report received ${new Date(receivedAt).toLocaleString()}; device measurement time unknown.`,
    })
  })

  it('should keep a real cached zero while distinguishing retrieval from measurement time', () => {
    expect(resolveDisplayMetric(null, { value: 0, receivedAt, source: 'rest-cache' })).toEqual({
      value: 0,
      cacheLabel: 'Cached EcoFlow value',
      cacheTooltip: `Measurement time unknown; fetched ${new Date(receivedAt).toLocaleString()}`,
    })
  })

  it('should leave absent or invalid cache entries unavailable', () => {
    expect(resolveDisplayMetric(null)).toEqual({ value: null, cacheLabel: null })
    for (const invalid of [NaN, Infinity]) {
      expect(resolveDisplayMetric(null, { value: invalid, receivedAt, source: 'mqtt' }).value).toBeNull()
      expect(resolveDisplayMetric(null, { value: 24, receivedAt: invalid, source: 'mqtt' }).value).toBeNull()
    }
    expect(resolveDisplayMetric(null, { value: 24, receivedAt: 1e100, source: 'rest-cache' }).value).toBeNull()
  })
})

describe('reported temperature', () => {
  it.each([0, 39])('should show a real MQTT temperature (%s) with its actual receipt time', value => {
    expect(resolveTemperatureMetric({ value, receivedAt, source: 'mqtt' }, receivedAt + 1_000)).toEqual({
      value, receivedAt, expiresAt: receivedAt + TEMPERATURE_FRESHNESS_MS, status: 'reported',
      label: `Reported ${new Date(receivedAt).toLocaleString()}`,
      tooltip: `Temperature reported by the device at ${new Date(receivedAt).toLocaleString()}.`,
    })
  })

  it('should mark an old real temperature stale without inventing a newer timestamp', () => {
    const report = { value: 39, receivedAt, source: 'mqtt' as const }
    expect(resolveTemperatureMetric(report, receivedAt + TEMPERATURE_FRESHNESS_MS).status).toBe('reported')
    expect(resolveTemperatureMetric(report, receivedAt + TEMPERATURE_FRESHNESS_MS + 1)).toMatchObject({
      value: 39, receivedAt, status: 'stale',
      label: `Stale • reported ${new Date(receivedAt).toLocaleString()}`,
    })
  })

  it('should wait rather than present REST temperature as a measurement', () => {
    for (const report of [undefined, null, { value: 39, receivedAt, source: 'rest-cache' as const }]) {
      expect(resolveTemperatureMetric(report, receivedAt)).toEqual({
        value: null, receivedAt: null, expiresAt: null, status: 'waiting', label: 'Waiting for temperature',
      })
    }
  })

  it('should reject invalid temperature or receipt metadata', () => {
    for (const invalid of [NaN, Infinity]) {
      expect(resolveTemperatureMetric({ value: invalid, receivedAt, source: 'mqtt' }, receivedAt).status).toBe('waiting')
      expect(resolveTemperatureMetric({ value: 39, receivedAt: invalid, source: 'mqtt' }, receivedAt).status).toBe('waiting')
    }
    expect(resolveTemperatureMetric({ value: 39, receivedAt: 1e100, source: 'mqtt' }, receivedAt).status).toBe('waiting')
  })

  it('should reject an implausible future receipt while allowing a small browser clock skew', () => {
    expect(resolveTemperatureMetric({ value: 39, receivedAt: receivedAt + 60_000, source: 'mqtt' }, receivedAt).status).toBe('waiting')
    expect(resolveTemperatureMetric({ value: 39, receivedAt: receivedAt + 1_000, source: 'mqtt' }, receivedAt).status).toBe('reported')
  })
})

describe('compact temperature age', () => {
  it.each([
    [0, 'Just now', 60_000],
    [59_999, 'Just now', 60_000],
    [60_000, '1 min ago', 120_000],
    [120_000, '2 min ago', 180_000],
    [360_001, 'Stale · 6m', 420_000],
    [3_600_000, 'Stale · 1h', 7_200_000],
    [86_400_000, 'Stale · 1d', 172_800_000],
  ] as const)('should show %s ms as %s and schedule only its next label boundary', (age, label, nextAge) => {
    const now = receivedAt + age
    const metric = resolveTemperatureMetric({ value: 37, receivedAt, source: 'mqtt' }, now)
    expect(getTemperatureAge(metric, now)).toEqual({ label, nextUpdateAt: receivedAt + nextAge })
  })

  it('should not schedule an age clock without a proven temperature report', () => {
    expect(getTemperatureAge(resolveTemperatureMetric())).toEqual({ label: 'Waiting', nextUpdateAt: null })
  })
})
