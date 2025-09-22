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
  outputWatts?: number
  acOutputWatts?: number
  dcOutputWatts?: number
  usbOutputWatts?: number
  temperature?: number
  totalOutput?: number
}

// Convert DeviceReading[] to chart-friendly format
export const transformReadingsToChartData = (readings: DeviceReading[]): ChartDataPoint[] => {
  return readings.map(reading => ({
    timestamp: reading.recordedAt.toISOString(),
    formattedTime: format(reading.recordedAt, 'MMM dd HH:mm'),
    batteryLevel: reading.batteryLevel,
    inputWatts: reading.inputWatts,
    outputWatts: reading.outputWatts,
    acOutputWatts: reading.acOutputWatts,
    dcOutputWatts: reading.dcOutputWatts,
    usbOutputWatts: reading.usbOutputWatts,
    temperature: reading.temperature,
    totalOutput: (reading.acOutputWatts || 0) + (reading.dcOutputWatts || 0) + (reading.usbOutputWatts || 0)
  }))
}

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-gray-300 text-sm mb-2">{label}</p>
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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
          />
          <YAxis 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
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
            stroke="#10B981"
            fill="#10B981"
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
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="formattedTime" 
              stroke="#9CA3AF"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#9CA3AF"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => `${value}W`}
            />
            <Tooltip 
              content={<CustomTooltip />}
              formatter={(value: any, name: string) => {
                const unit = 'W'
                const displayName = name === 'acOutputWatts' ? 'AC Output' :
                                 name === 'dcOutputWatts' ? 'DC Output' :
                                 name === 'usbOutputWatts' ? 'USB Output' :
                                 name === 'inputWatts' ? 'Input Power' : name
                return [`${value}${unit}`, displayName]
              }}
            />
            <Legend />
            
            {/* Input power as line */}
            <Line
              type="monotone"
              dataKey="inputWatts"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={false}
              name="Input Power"
            />
            
            {/* Stacked areas for output breakdown */}
            <Area
              type="monotone"
              dataKey="acOutputWatts"
              stackId="1"
              stroke="#3B82F6"
              fill="#3B82F6"
              fillOpacity={0.6}
              name="AC Output"
            />
            <Area
              type="monotone"
              dataKey="dcOutputWatts"
              stackId="1"
              stroke="#F59E0B"
              fill="#F59E0B"
              fillOpacity={0.6}
              name="DC Output"
            />
            <Area
              type="monotone"
              dataKey="usbOutputWatts"
              stackId="1"
              stroke="#10B981"
              fill="#10B981"
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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
          />
          <YAxis 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
            tickFormatter={(value) => `${value}W`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            formatter={(value: any, name: string) => {
              const unit = 'W'
              const displayName = name === 'inputWatts' ? 'Input Power' : 
                               name === 'outputWatts' ? 'Output Power' : name
              return [`${value}${unit}`, displayName]
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="inputWatts"
            stroke="#8B5CF6"
            strokeWidth={2}
            dot={false}
            name="Input Power"
          />
          <Line
            type="monotone"
            dataKey="outputWatts"
            stroke="#F59E0B"
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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
          />
          <YAxis 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
            tickFormatter={(value) => `${value}°C`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            formatter={(value: any) => [`${value}°C`, 'Temperature']}
          />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="#EF4444"
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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
          />
          <YAxis 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
            tickFormatter={(value) => `${value}W`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            formatter={(value: any, name: string) => {
              const unit = 'W'
              const displayName = name === 'inputWatts' ? 'Input Power' : 'Total Output'
              return [`${value}${unit}`, displayName]
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="inputWatts"
            stroke="#8B5CF6"
            fill="#8B5CF6"
            fillOpacity={0.3}
            name="Input Power"
          />
          <Area
            type="monotone"
            dataKey="totalOutput"
            stroke="#F59E0B"
            fill="#F59E0B"
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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="formattedTime" 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
          />
          <YAxis 
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
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
            stroke="#06B6D4"
            fill="#06B6D4"
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
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeChart === tab.id
                ? 'bg-accent-green text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
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