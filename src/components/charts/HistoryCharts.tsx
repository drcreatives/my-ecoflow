'use client'

import { useMemo, useState } from 'react'
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Brush
} from 'recharts'
import { DeviceReading, type TemperatureHistoryReading } from '@/lib/data-utils'
import { TEMPERATURE_FEATURE_ENABLED } from '@/lib/features'
import { format, parseISO } from 'date-fns'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { getTrustedInputChannels, getVerifiedSolarPanelInput } from '@/lib/reading-status'
import { chartColors } from '@/lib/chart-theme'

// Chart data transformation utilities
export interface ChartDataPoint {
  timestamp: string
  formattedTime: string
  batteryLevel?: number
  inputWatts?: number
  acInputWatts?: number
  dcInputWatts?: number
  solarPanelInputWatts?: number
  solarPanelReceivedAt?: number
  solarPanelSampleCount?: number
  solarPanelSegment?: number
  sampleCount?: number
  chargingType?: number
  outputWatts?: number
  acOutputWatts?: number
  dcOutputWatts?: number
  usbOutputWatts?: number
  temperature?: number
  temperatureReceivedAt?: number
  temperatureSampleCount?: number
  temperatureSegment?: number
  temperatureAverage?: boolean
  totalOutput?: number
  totalInput?: number
}

export interface ChartRange {
  startIndex: number
  endIndex: number
}

// Convert DeviceReading[] to chart-friendly format
export interface ChartDataOptions {
  aggregation?: 'raw' | '5m' | '15m' | '1h' | '1d'
  samplingIntervalMs?: number | null
  collectionIntervalMinutes?: number | null
}

const PANEL_SERIES_NAME = 'Solar panels (separate measurement)'
const BUCKET_WIDTH_MS = { raw: 0, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '1d': 86_400_000 }

export const transformReadingsToChartData = (readings: DeviceReading[], options: ChartDataOptions = {}): ChartDataPoint[] => {
  const rawGapMs = Math.max(
    120_000,
    (finitePower(options.collectionIntervalMinutes) ?? 0) * 120_000,
    (finitePower(options.samplingIntervalMs) ?? 0) * 2
  )
  const bucketGapMs = Math.max(BUCKET_WIDTH_MS[options.aggregation ?? 'raw'], rawGapMs)
  let previousPanel: { time: number; average: boolean; segment: number } | null = null
  let nextSegment = -1
  return readings.map(reading => {
    const dateObj = reading.recordedAt instanceof Date ? reading.recordedAt : new Date(reading.recordedAt)
    const inputChannels = getTrustedInputChannels(reading)
    const panelReport = getVerifiedSolarPanelInput(reading)
    const rawPanel = panelReport && Math.abs(panelReport.receivedAt - dateObj.getTime()) <= 5_000
      ? panelReport : null
    const panelAverage = finitePower(reading.solarPanelAverageWatts)
    const panelSamples = reading.solarPanelSampleCount
    const samples = reading.sampleCount
    const hasPanelAverage = panelAverage !== undefined && typeof panelSamples === 'number' &&
      Number.isInteger(panelSamples) && panelSamples > 0 && typeof samples === 'number' &&
      Number.isInteger(samples) && samples >= panelSamples
    const panelWatts = hasPanelAverage ? panelAverage : rawPanel?.watts
    const panelTime = hasPanelAverage ? dateObj.getTime() : rawPanel?.receivedAt
    let panelSegment: number | undefined
    if (panelWatts !== undefined && panelTime !== undefined) {
      const elapsed = previousPanel ? panelTime - previousPanel.time : 0
      const canJoin = previousPanel && previousPanel.average === hasPanelAverage &&
        elapsed > 0 && elapsed <= (hasPanelAverage ? bucketGapMs : rawGapMs)
      panelSegment = canJoin && previousPanel ? previousPanel.segment : ++nextSegment
      previousPanel = { time: panelTime, average: hasPanelAverage, segment: panelSegment }
    } else {
      previousPanel = null
    }
    return {
      timestamp: dateObj.toISOString(),
      formattedTime: format(dateObj, 'MMM dd HH:mm'),
      batteryLevel: reading.batteryLevel ?? undefined,
      inputWatts: finitePower(reading.inputWatts),
      acInputWatts: inputChannels?.acInputWatts,
      dcInputWatts: inputChannels?.dcInputWatts,
      solarPanelInputWatts: panelWatts,
      solarPanelReceivedAt: hasPanelAverage ? undefined : rawPanel?.receivedAt,
      solarPanelSampleCount: hasPanelAverage ? panelSamples : rawPanel ? 1 : undefined,
      solarPanelSegment: panelSegment,
      sampleCount: hasPanelAverage ? samples : rawPanel ? 1 : undefined,
      chargingType: reading.chargingType ?? undefined,
      outputWatts: reading.outputWatts ?? undefined,
      acOutputWatts: reading.acOutputWatts ?? undefined,
      dcOutputWatts: reading.dcOutputWatts ?? undefined,
      usbOutputWatts: reading.usbOutputWatts ?? undefined,
      temperature: typeof reading.temperature === 'number' && Number.isFinite(reading.temperature)
        ? reading.temperature : undefined,
      totalOutput: reading.outputWatts ?? undefined,
      totalInput: finitePower(reading.inputWatts)
    }
  })
}

/** Thermal observations have their own time axis and never enter the power transform. */
export function transformTemperatureReadingsToChartData(
  readings: readonly TemperatureHistoryReading[],
  aggregation: ChartDataOptions['aggregation'] = 'raw',
): ChartDataPoint[] {
  const maxGapMs = Math.max(6 * 60_000, BUCKET_WIDTH_MS[aggregation])
  const previousByDevice = new Map<string, { receivedAt: number; segment: number }>()
  let nextSegment = -1
  return [...readings]
    .filter(reading => Number.isFinite(reading.temperature) && Number.isFinite(reading.recordedAt))
    .sort((left, right) => left.recordedAt - right.recordedAt)
    .map(reading => {
      const previous = previousByDevice.get(reading.deviceId)
      const elapsed = previous ? reading.recordedAt - previous.receivedAt : 0
      const segment = previous && elapsed > 0 && elapsed <= maxGapMs ? previous.segment : ++nextSegment
      previousByDevice.set(reading.deviceId, { receivedAt: reading.recordedAt, segment })
      const date = new Date(reading.recordedAt)
      return {
        timestamp: date.toISOString(), formattedTime: format(date, 'MMM dd HH:mm'),
        temperature: reading.temperature, temperatureSampleCount: reading.temperatureSampleCount,
        temperatureReceivedAt: aggregation === 'raw' ? reading.recordedAt : undefined,
        temperatureAverage: aggregation !== 'raw', temperatureSegment: segment,
      }
    })
}

/** Separate line segments keep genuine observation gaps visible, including legacy callers. */
export function getTemperatureSeries(data: ChartDataPoint[]) {
  let previousTime: number | null = null
  let segment = -1
  const memberships = data.map(point => {
    if (typeof point.temperature !== 'number' || !Number.isFinite(point.temperature)) {
      previousTime = null
      return undefined
    }
    const receivedAt = new Date(point.timestamp).getTime()
    if (point.temperatureSegment !== undefined) return point.temperatureSegment
    if (previousTime === null || receivedAt <= previousTime || receivedAt - previousTime > 6 * 60_000) segment++
    previousTime = receivedAt
    return segment
  })
  const membershipByPoint = new Map(data.map((point, index) => [point, memberships[index]]))
  return [...new Set(memberships.filter(value => value !== undefined))].map(segment => ({
    segment,
    value: (point: ChartDataPoint) => membershipByPoint.get(point) === segment ? point.temperature : undefined,
  }))
}

/** Mask each proven segment over the original index space so zoom stays stable. */
export function getSolarPanelSeries(data: ChartDataPoint[]) {
  const segments = new Set(data
    .filter(point => finitePower(point.solarPanelInputWatts) !== undefined)
    .map(point => point.solarPanelSegment ?? 0))
  return Array.from(segments, segment => ({
    segment,
    value: (point: ChartDataPoint) => (point.solarPanelSegment ?? 0) === segment
      ? finitePower(point.solarPanelInputWatts) : undefined,
  }))
}

function finitePower(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function clampChartRange(range: ChartRange, dataLength: number): ChartRange {
  if (dataLength <= 0) return { startIndex: 0, endIndex: 0 }

  const startIndex = Math.max(0, Math.min(range.startIndex, dataLength - 1))
  const endIndex = Math.max(
    startIndex,
    Math.min(range.endIndex, dataLength - 1)
  )
  return { startIndex, endIndex }
}

export function resizeChartRange(
  range: ChartRange,
  dataLength: number,
  direction: 'in' | 'out'
): ChartRange {
  const current = clampChartRange(range, dataLength)
  if (dataLength <= 1) return current

  const currentSize = current.endIndex - current.startIndex + 1
  const minimumSize = Math.min(10, dataLength)
  const targetSize =
    direction === 'in'
      ? Math.max(minimumSize, Math.floor(currentSize * 0.6))
      : Math.min(dataLength, Math.ceil(currentSize / 0.6))

  if (targetSize === currentSize) return current

  const center = (current.startIndex + current.endIndex) / 2
  const startIndex = Math.max(
    0,
    Math.min(
      Math.round(center - (targetSize - 1) / 2),
      dataLength - targetSize
    )
  )

  return { startIndex, endIndex: startIndex + targetSize - 1 }
}

interface ChartZoomControlsProps {
  data: ChartDataPoint[]
  range: ChartRange
  onRangeChange: (range: ChartRange) => void
}

export function ChartZoomControls({
  data,
  range,
  onRangeChange,
}: ChartZoomControlsProps) {
  const normalizedRange = clampChartRange(range, data.length)
  const visiblePoints = normalizedRange.endIndex - normalizedRange.startIndex + 1
  const minimumSize = Math.min(10, data.length)
  const isFullyZoomedOut = visiblePoints >= data.length
  const isFullyZoomedIn = visiblePoints <= minimumSize

  return (
    <div className="rounded-inner border border-stroke-subtle bg-surface-2/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">Chart range</p>
          <p className="text-xs text-text-muted" aria-live="polite">
            Showing {visiblePoints.toLocaleString()} of {data.length.toLocaleString()} points · applies to all charts
          </p>
        </div>
        <div className="flex items-center gap-2" aria-label="Chart zoom controls">
          <button
            type="button"
            onClick={() =>
              onRangeChange(resizeChartRange(normalizedRange, data.length, 'in'))
            }
            disabled={isFullyZoomedIn}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-stroke-subtle bg-surface-1 px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom in horizontally"
          >
            <ZoomIn size={15} />
            Zoom in
          </button>
          <button
            type="button"
            onClick={() =>
              onRangeChange(resizeChartRange(normalizedRange, data.length, 'out'))
            }
            disabled={isFullyZoomedOut}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-stroke-subtle bg-surface-1 px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom out horizontally"
          >
            <ZoomOut size={15} />
            Zoom out
          </button>
          <button
            type="button"
            onClick={() =>
              onRangeChange({ startIndex: 0, endIndex: data.length - 1 })
            }
            disabled={isFullyZoomedOut}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-stroke-subtle bg-surface-1 px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Reset chart zoom"
          >
            <RotateCcw size={15} />
            Reset
          </button>
        </div>
      </div>

      <div className="h-12 w-full" aria-label="Drag handles to select a chart time range">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
            <Area
              type="monotone"
              dataKey="totalOutput"
              stroke="#44af21"
              fill="#44af21"
              fillOpacity={0.14}
              isAnimationActive={false}
            />
            <Brush
              dataKey="formattedTime"
              startIndex={normalizedRange.startIndex}
              endIndex={normalizedRange.endIndex}
              height={28}
              travellerWidth={10}
              stroke="#44af21"
              fill="#242624"
              ariaLabel="Select chart time range"
              onChange={(nextRange) =>
                onRangeChange({
                  startIndex: nextRange.startIndex,
                  endIndex: nextRange.endIndex,
                })
              }
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Custom tooltip component
interface ChartTooltipEntry {
  color?: string
  name?: string
  value?: number | string
  unit?: string | number
  dataKey?: unknown
  payload?: ChartDataPoint
}

export const CustomTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: ChartTooltipEntry[]
  label?: string | number
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface-2 border border-stroke-subtle rounded-inner p-3 shadow-card">
        <p className="text-text-muted text-sm mb-2">{label}</p>
        {payload.filter(entry => TEMPERATURE_FEATURE_ENABLED || entry.name !== 'Temperature').map((entry, index) => (
          <div key={index}>
            <p className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value}${entry.unit || ''}`}
            </p>
            {(entry.dataKey === 'solarPanelInputWatts' || entry.name === PANEL_SERIES_NAME) && entry.payload && (
              <p className="mt-1 text-xs text-text-muted">
                {entry.payload.solarPanelReceivedAt !== undefined
                  ? `Panel report received ${new Date(entry.payload.solarPanelReceivedAt).toLocaleString()}`
                  : `Panel average: ${entry.payload.solarPanelSampleCount} of ${entry.payload.sampleCount} sampled readings`}
              </p>
            )}
            {entry.name === 'Temperature' && entry.payload && (
              <p className="mt-1 text-xs text-text-muted">
                {entry.payload.temperatureAverage
                  ? `Average of ${entry.payload.temperatureSampleCount} temperature readings in this bucket`
                  : entry.payload.temperatureReceivedAt !== undefined
                    ? `Temperature report received ${new Date(entry.payload.temperatureReceivedAt).toLocaleString()}`
                    : 'Stored temperature measurement'}
              </p>
            )}
          </div>
        ))}
      </div>
    )
  }
  return null
}

// Battery Level Chart Component
interface BatteryLevelChartProps {
  data: ChartDataPoint[]
  height?: number
}

export const BatteryLevelChart = ({ data, height = 300 }: BatteryLevelChartProps) => {
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242624" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            formatter={(value: any) => [`${value}%`, 'Battery Level']}
          />
          <Area
            type="monotone"
            dataKey="batteryLevel"
            stroke="#44af21"
            fill="#44af21"
            fillOpacity={0.3}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Power Usage Chart Component
interface PowerUsageChartProps {
  data: ChartDataPoint[]
  height?: number
  showBreakdown?: boolean
}

export const PowerUsageChart = ({ data, height = 300, showBreakdown = false }: PowerUsageChartProps) => {
  const panelSeries = useMemo(() => getSolarPanelSeries(data), [data])
  if (showBreakdown) {
    // Show breakdown with input line and stacked output areas
    return (
      <div className="w-full">
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#242624" />
            <XAxis 
              dataKey="formattedTime" 
              stroke="rgba(255,255,255,0.45)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="rgba(255,255,255,0.45)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}W`}
            />
            <Tooltip 
              content={<CustomTooltip />}
              formatter={(value: any, name: string) => {
                const unit = 'W'
                const displayName = name === 'acOutputWatts' ? 'AC Output' :
                                 name === 'dcOutputWatts' ? 'DC Output' :
                                 name === 'usbOutputWatts' ? 'USB Output' :
                                 name === 'acInputWatts' ? 'AC Input (Wall)' :
                                 name === 'dcInputWatts' ? 'DC Input (Solar/Car)' :
                                 name === 'inputWatts' ? 'Total Input' : name
                return [`${value}${unit}`, displayName]
              }}
            />
            <Legend />
            
            {/* Independent measurements are lines, never stacked together. */}
            <Line
              type="linear"
              dataKey="inputWatts"
              stroke={chartColors.inputPower}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              name="Station input"
              unit="W"
            />
            {panelSeries.map((series, index) => <Line
              key={series.segment}
              type="linear"
              dataKey={series.value}
              stroke={chartColors.battery}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
              name={PANEL_SERIES_NAME}
              legendType={index === 0 ? 'line' : 'none'}
              unit="W"
            />)}
            <Line
              type="monotone"
              dataKey="acInputWatts"
              stroke="#3a6fe3"
              strokeWidth={2}
              dot={false}
              name="AC Input (Wall)"
            />
            <Line
              type="monotone"
              dataKey="dcInputWatts"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              name="DC Input (Solar/Car)"
            />
            
            {/* Stacked areas for output breakdown */}
            <Area
              type="monotone"
              dataKey="acOutputWatts"
              stackId="1"
              stroke="#00c356"
              fill="#00c356"
              fillOpacity={0.6}
              name="AC Output"
            />
            <Area
              type="monotone"
              dataKey="dcOutputWatts"
              stackId="1"
              stroke="#ffa500"
              fill="#ffa500"
              fillOpacity={0.6}
              name="DC Output"
            />
            <Area
              type="monotone"
              dataKey="usbOutputWatts"
              stackId="1"
              stroke="#00e16e"
              fill="#00e16e"
              fillOpacity={0.6}
              name="USB Output"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Simple input vs total output chart
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242624" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}W`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            formatter={(value: any, name: string) => {
              const unit = 'W'
              const displayName = name === 'inputWatts' ? 'Total Input' : 
                               name === 'acInputWatts' ? 'AC Input (Wall)' :
                               name === 'dcInputWatts' ? 'DC Input (Solar/Car)' :
                               name === 'outputWatts' ? 'Output Power' : name
              return [`${value}${unit}`, displayName]
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="inputWatts"
            stroke="#3a6fe3"
            strokeWidth={2}
            dot={false}
            name="Station input"
            unit="W"
          />
          {panelSeries.map((series, index) => <Line
            key={series.segment}
            type="linear"
            dataKey={series.value}
            stroke={chartColors.battery}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls={false}
            name={PANEL_SERIES_NAME}
            legendType={index === 0 ? 'line' : 'none'}
            unit="W"
          />)}
          <Line
            type="monotone"
            dataKey="acInputWatts"
            stroke="#60a5fa"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="5 5"
            name="AC Input (Wall)"
          />
          <Line
            type="monotone"
            dataKey="dcInputWatts"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="5 5"
            name="DC Input (Solar/Car)"
          />
          <Line
            type="monotone"
            dataKey="outputWatts"
            stroke="#ffa500"
            strokeWidth={2}
            dot={false}
            name="Output Power"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Temperature Chart Component
interface TemperatureChartProps {
  data: ChartDataPoint[]
  height?: number
}

export const TemperatureChart = ({ data, height = 300 }: TemperatureChartProps) => {
  if (!TEMPERATURE_FEATURE_ENABLED) return null
  const series = getTemperatureSeries(data)
  if (!data.some(point => typeof point.temperature === 'number' && Number.isFinite(point.temperature))) {
    return (
      <div className="flex items-center justify-center text-sm text-text-muted" style={{ height }}>
        No temperature measurements in this range.
      </div>
    )
  }
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242624" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}°C`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            formatter={(value) => [`${value}°C`, 'Temperature']}
          />
          {series.map(series => <Line
            key={series.segment}
            type="linear"
            dataKey={series.value}
            stroke={chartColors.temperature}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
            name="Temperature"
            unit="°C"
          />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Power Flow Chart - shows input vs total output
interface PowerFlowChartProps {
  data: ChartDataPoint[]
  height?: number
}

export const PowerFlowChart = ({ data, height = 300 }: PowerFlowChartProps) => {
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242624" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}W`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            formatter={(value: any, name: string) => {
              const unit = 'W'
              const displayName = name === 'inputWatts' ? 'Total Input' : 
                               name === 'acInputWatts' ? 'AC Input (Wall)' :
                               name === 'dcInputWatts' ? 'DC Input (Solar/Car)' :
                               'Total Output'
              return [`${value}${unit}`, displayName]
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="inputWatts"
            stroke="#3a6fe3"
            fill="#3a6fe3"
            fillOpacity={0.3}
            name="Total Input"
          />
          <Area
            type="monotone"
            dataKey="dcInputWatts"
            stroke="#8b5cf6"
            fill="#8b5cf6"
            fillOpacity={0.2}
            name="DC Input (Solar/Car)"
          />
          <Area
            type="monotone"
            dataKey="totalOutput"
            stroke="#ffa500"
            fill="#ffa500"
            fillOpacity={0.3}
            name="Total Output"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Efficiency Chart - shows power efficiency over time
interface EfficiencyChartProps {
  data: ChartDataPoint[]
  height?: number
}

export const EfficiencyChart = ({ data, height = 300 }: EfficiencyChartProps) => {
  // Calculate efficiency for each data point
  const dataWithEfficiency = data.map(point => ({
    ...point,
    efficiency: point.inputWatts && point.inputWatts > 0 
      ? Math.min(100, ((point.totalOutput || 0) / point.inputWatts) * 100)
      : 0
  }))

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={dataWithEfficiency} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242624" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            formatter={(value: any) => [`${value.toFixed(1)}%`, 'Efficiency']}
          />
          <Area
            type="monotone"
            dataKey="efficiency"
            stroke="#3a6fe3"
            fill="#3a6fe3"
            fillOpacity={0.3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Combined Chart Component with tabs
interface CombinedChartProps {
  data: ChartDataPoint[]
  temperatureData?: ChartDataPoint[]
  height?: number
  defaultChart?: 'power' | 'battery' | 'temperature' | 'efficiency'
}

export const CombinedChart = ({ data, temperatureData, height = 400, defaultChart = 'power' }: CombinedChartProps) => {
  const [activeChart, setActiveChart] = useState(defaultChart)
  const temperatureOnly = TEMPERATURE_FEATURE_ENABLED && data.length === 0 && temperatureData?.some(point =>
    typeof point.temperature === 'number' && Number.isFinite(point.temperature))
  // A filtered sensor-only range still has useful data. Retain the user's normal
  // chart choice so returning to power observations restores that choice.
  const displayedChart = temperatureOnly ? 'temperature'
    : !TEMPERATURE_FEATURE_ENABLED && activeChart === 'temperature' ? 'power' : activeChart

  const chartTabs = [
    { id: 'power', label: 'Power Usage', icon: '⚡' },
    { id: 'battery', label: 'Battery Level', icon: '🔋' },
    { id: 'temperature', label: 'Temperature', icon: '🌡️' },
    { id: 'efficiency', label: 'Efficiency', icon: '📊' },
  ] as const

  const renderChart = () => {
    switch (displayedChart) {
      case 'power':
        return <PowerUsageChart data={data} height={height} showBreakdown />
      case 'battery':
        return <BatteryLevelChart data={data} height={height} />
      case 'temperature':
        return <TemperatureChart data={temperatureData ?? data} height={height} />
      case 'efficiency':
        return <EfficiencyChart data={data} height={height} />
      default:
        return <PowerUsageChart data={data} height={height} />
    }
  }

  return (
    <div className="w-full">
      {/* Chart Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {chartTabs.filter(tab => TEMPERATURE_FEATURE_ENABLED || tab.id !== 'temperature').map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveChart(tab.id)}
            aria-pressed={displayedChart === tab.id}
            disabled={temperatureOnly && tab.id !== 'temperature'}
            className={`flex items-center gap-2 px-3 py-2 rounded-pill text-sm font-medium transition-colors ${
              displayedChart === tab.id
                ? 'bg-brand-primary text-bg-base'
                : 'bg-surface-2 text-text-secondary hover:bg-surface-2/80'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart Content */}
      {renderChart()}
    </div>
  )
}
