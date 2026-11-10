const energyFormatter = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 3 })
const moneyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2,
})

export const LOW_BALANCE_WH = 5_000

export function formatEnergy(wattHours: number): string {
  return `${energyFormatter.format(wattHours / 1_000)} kWh`
}

export function formatPower(watts: number): string {
  return watts >= 1_000
    ? `${energyFormatter.format(watts / 1_000)} kW`
    : `${energyFormatter.format(watts)} W`
}

export function formatMoney(kobo: number): string {
  return moneyFormatter.format(kobo / 100)
}
