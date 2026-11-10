import { describe, expect, it } from 'vitest'
import { formatEnergy, formatMoney, formatPower } from './meter-format'

describe('meter presentation units', () => {
  it('preserves a one Wh balance when displaying prepaid kWh', () => {
    expect(formatEnergy(1)).toBe('0.001 kWh')
    expect(formatEnergy(12_345)).toBe('12.345 kWh')
    expect(formatEnergy(0)).toBe('0 kWh')
  })

  it('scales load units separately from energy units', () => {
    expect(formatPower(650)).toBe('650 W')
    expect(formatPower(1_250)).toBe('1.25 kW')
  })

  it('converts integer kobo to naira for display', () => {
    expect(formatMoney(12_345)).toContain('123.45')
  })
})
