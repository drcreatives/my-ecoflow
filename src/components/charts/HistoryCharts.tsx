'use client'

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
  ComposedChart
} from 'recharts'
import { DeviceReading } from '@/lib/data-utils'
import { format, parseISO } from 'date-fns'

// Chart data transformation utilities
interface ChartDataPoint {
  timestamp: string
  formattedTime: string
  batteryLevel?: number
  inputWatts?: number
  acInputWatts?: number
  dcInputWatts?: number
  chargingType?: number
  outputWatts?: number
  acOutputWatts?: number
  dcOutputWatts?: number
  usbOutputWatts?: number
  temperature?: number
  totalOutput?: number
  totalInput?: number
}

// Convert DeviceReading[] to chart-friendly format
export const transformReadingsToChartData = (readings: DeviceReading[]): ChartDataPoint[] => {
  return readings.map(reading => {
    const dateObj = reading.recordedAt instanceof Date ? reading.recordedAt : new Date(reading.recordedAt)
    return {
      timestamp: dateObj.toISOString(),
      formattedTime: format(dateObj, 'MMM dd HH:mm'),
      batteryLevel: reading.batteryLevel ?? undefined,
      inputWatts: reading.inputWatts ?? undefined,
      acInputWatts: reading.acInputWatts ?? undefined,
      dcInputWatts: reading.dcInputWatts ?? undefined,
      chargingType: reading.chargingType ?? undefined,
      outputWatts: reading.outputWatts ?? undefined,
      acOutputWatts: reading.acOutputWatts ?? undefined,
      dcOutputWatts: reading.dcOutputWatts ?? undefined,
      usbOutputWatts: reading.usbOutputWatts ?? undefined,
      temperature: reading.temperature ?? undefined,
      totalOutput: (reading.acOutputWatts || 0) + (reading.dcOutputWatts || 0) + (reading.usbOutputWatts || 0),
      totalInput: (reading.acInputWatts || 0) + (reading.dcInputWatts || 0)
    }
  })
}

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface-2 border border-stroke-subtle rounded-inner p-3 shadow-card">
        <p className="text-text-muted text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {`${entry.name}: ${entry.value}${entry.unit || ''}`}
          </p>
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
            
            {/* Input power - show AC vs DC input breakdown */}
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
            name="Total Input"
          />
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
            formatter={(value: any) => [`${value}°C`, 'Temperature']}
          />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="#ff4444"
            strokeWidth={2}
            dot={false}
          />
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
  height?: number
  defaultChart?: 'power' | 'battery' | 'temperature' | 'efficiency'
}

export const CombinedChart = ({ data, height = 400, defaultChart = 'power' }: CombinedChartProps) => {
  const [activeChart, setActiveChart] = useState(defaultChart)

  const chartTabs = [
    { id: 'power', label: 'Power Usage', icon: '⚡' },
    { id: 'battery', label: 'Battery Level', icon: '🔋' },
    { id: 'temperature', label: 'Temperature', icon: '🌡️' },
    { id: 'efficiency', label: 'Efficiency', icon: '📊' },
  ]

  const renderChart = () => {
    switch (activeChart) {
      case 'power':
        return <PowerUsageChart data={data} height={height} showBreakdown />
      case 'battery':
        return <BatteryLevelChart data={data} height={height} />
      case 'temperature':
        return <TemperatureChart data={data} height={height} />
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
        {chartTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveChart(tab.id as any)}
            className={`flex items-center gap-2 px-3 py-2 rounded-pill text-sm font-medium transition-colors ${
              activeChart === tab.id
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

// Need to import useState
import { useState } from 'react'