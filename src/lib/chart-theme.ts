/**
 * Centralized Recharts theme configuration
 * All chart colors, grid style, tooltip style, and axis style in one place.
 */

// ── Brand-aligned chart palette ──────────────────────────────
export const chartColors = {
  battery: '#44af21',       // brand-primary
  inputPower: '#3a6fe3',    // brand-tertiary
  acOutput: '#00c356',      // brand-secondary
  dcOutput: '#ffa500',      // warning
  usbOutput: '#00e16e',     // success
  temperature: '#ff4444',   // danger
  efficiency: '#3a6fe3',    // brand-tertiary
  outputPower: '#ffa500',   // warning (alias)
  totalOutput: '#ffa500',   // warning (alias)
} as const

// ── Grid ─────────────────────────────────────────────────────
export const gridStyle = {
  stroke: '#242624',        // surface-2
  strokeDasharray: '3 3',
} as const

// ── Axes ─────────────────────────────────────────────────────
export const axisStyle = {
  stroke: 'rgba(255,255,255,0.45)',   // text-muted equivalent
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

// ── Tooltip container classes ────────────────────────────────
export const tooltipClassName =
  'bg-surface-2 border border-stroke-subtle rounded-inner shadow-card' as const

export const tooltipLabelClassName = 'text-text-muted text-sm mb-2' as const

// ── Shared area / line props ─────────────────────────────────
export const defaultFillOpacity = 0.3

export const chartTheme = {
  colors: chartColors,
  grid: gridStyle,
  axis: axisStyle,
  tooltipClassName,
  tooltipLabelClassName,
  defaultFillOpacity,
} as const

export default chartTheme
