"use client"

import { useEffect, useState, useMemo } from "react";
import { useConvexDevices, useConvexHistoryReadings } from "@/hooks/useConvexData";
import { CombinedChart, BatteryLevelChart, TemperatureChart, transformReadingsToChartData } from "@/components/charts/HistoryCharts";
import { Loader2, Battery, Thermometer, BarChart3, ExternalLink, Filter, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { DateTimePicker } from '@/components/ui/DateTimePicker';

// Types for analytics data
interface HistoryFilters {
  deviceId: string | 'all'
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d' | 'custom'
  customStartDate?: string
  customEndDate?: string
  aggregation: 'raw' | '5m' | '1h' | '1d'
}

function formatTimeSpan(startTime: number, endTime: number): string {
  const diffMs = endTime - startTime;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours} hours`;
  const mins = Math.floor(diffMs / (1000 * 60));
  return `${mins} minutes`;
}

interface HistorySummary {
	totalReadings: number;
	avgBatteryLevel: number;
	avgPowerOutput: number;
	avgTemperature: number;
	peakPowerOutput: number;
	lowestBatteryLevel: number;
	highestTemperature: number;
	startTime: number;
	endTime: number;
}

interface DeviceOption {
  id: string
  name: string
  sn: string
  isActive: boolean
}

function AnalyticsPage() {
	const { devices, isLoading: devicesLoading } = useConvexDevices();

	// Filter state
	const [filters, setFilters] = useState<HistoryFilters>({
		deviceId: 'all',
		timeRange: '24h',
		aggregation: '1h'
	});

	// UI state
	const [showFilters, setShowFilters] = useState(false);

	// Device options for dropdown
	const deviceOptions: DeviceOption[] = [
		{ id: 'all', name: 'All Devices', sn: '', isActive: true },
		...devices.map(device => ({
			id: device.id,
			name: device.deviceName || `Device ${device.deviceSn}`,
			sn: device.deviceSn,
			isActive: !device.id.startsWith('temp-')
		}))
	];

	const selectedDevice = deviceOptions.find(d => d.id === filters.deviceId);

	// Set default device when devices load
	useEffect(() => {
		if (devices.length > 0 && filters.deviceId === 'all') {
			setFilters(prev => ({ ...prev, deviceId: devices[0].id }));
		}
	}, [devices, filters.deviceId]);

	// ─── Convex reactive query for analytics data ──────────────────────────
	const shouldQuery =
		filters.deviceId !== 'all' &&
		(filters.timeRange !== 'custom' ||
			(!!filters.customStartDate && !!filters.customEndDate));

	const {
		readings,
		summary,
		isLoading,
		error,
	} = useConvexHistoryReadings(
		shouldQuery ? filters.deviceId : null,
		{
			timeRange: filters.timeRange !== 'custom' ? filters.timeRange : undefined,
			customStartDate: filters.customStartDate,
			customEndDate: filters.customEndDate,
			aggregation: filters.aggregation,
		}
	);

	// Convert readings to chart-compatible format (Date objects for recordedAt)
	const chartReadings = useMemo(() =>
		readings.map((r: any) => ({
			...r,
			recordedAt: new Date(r.recordedAt),
		})),
		[readings]
	);

	const formatValue = (value: number | null | undefined, unit: string) => {
		if (value === null || value === undefined || isNaN(value)) return "0" + unit;
		return value.toFixed(1) + unit;
	};

	if (devicesLoading) {
		return (
			
				<div className="p-6">
					<div className="flex items-center justify-center h-64">
						<div className="text-center">
							<Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
							<p className="text-text-secondary">Loading devices...</p>
						</div>
					</div>
				</div>
			
		);
	}

	return (
		
			<div className="p-4 sm:p-6">
				<div className="flex flex-col gap-6">
					{/* Header */}
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div className="flex items-center gap-3">
							<BarChart3 size={28} className="text-brand-primary" />
							<h1 className="text-page-title text-text-primary font-medium">Analytics & Trends</h1>
						</div>
						
						<div className="flex items-center gap-2">
							<button
								onClick={() => setShowFilters(!showFilters)}
								className="flex items-center gap-2 px-3 py-2 bg-surface-2 hover:bg-surface-2/80 border border-stroke-subtle rounded-pill text-text-primary transition-all duration-160 text-sm"
							>
								<Filter size={16} />
								Filters
							</button>
							{isLoading && (
								<Loader2 size={16} className="animate-spin text-text-muted" />
							)}
						</div>
					</div>

					{/* Filters Panel */}
					{showFilters && (
						<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
							<h3 className="text-section-title font-medium text-text-primary mb-4">Data Filters</h3>
							
							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								{/* Device Selection */}
								<div>
									<label className="block text-sm font-medium text-text-secondary mb-2">
										Device
									</label>
									<div className="relative">
										<select
											value={filters.deviceId}
											onChange={(e) => setFilters(prev => ({ ...prev, deviceId: e.target.value }))}
											className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 appearance-none pr-10"
										>
											{deviceOptions.map(device => (
												<option key={device.id} value={device.id}>
													{device.name} {device.sn && `(${device.sn})`}
												</option>
											))}
										</select>
										<ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
									</div>
								</div>

								{/* Time Range */}
								<div>
									<label className="block text-sm font-medium text-text-secondary mb-2">
										Time Range
									</label>
									<div className="relative">
										<select
											value={filters.timeRange}
											onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as any }))}
											className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 appearance-none pr-10"
										>
											<option value="1h">Last Hour</option>
											<option value="6h">Last 6 Hours</option>
											<option value="24h">Last 24 Hours</option>
											<option value="7d">Last 7 Days</option>
											<option value="30d">Last 30 Days</option>
											<option value="custom">Custom Range</option>
										</select>
										<ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
									</div>
								</div>

								{/* Data Aggregation */}
								<div>
									<label className="block text-sm font-medium text-text-secondary mb-2">
										Data Points
									</label>
									<div className="relative">
										<select
											value={filters.aggregation}
											onChange={(e) => setFilters(prev => ({ ...prev, aggregation: e.target.value as any }))}
											className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 appearance-none pr-10"
										>
											<option value="raw">Raw Data</option>
											<option value="5m">5 Minute Average</option>
											<option value="1h">Hourly Average</option>
											<option value="1d">Daily Average</option>
										</select>
										<ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
									</div>
								</div>
							</div>

							{filters.timeRange === 'custom' && (
								<div className="mt-4 space-y-4">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div>
											<label className="block text-sm font-medium text-text-secondary mb-2">
												Start Date
											</label>
											<DateTimePicker
												value={filters.customStartDate || ''}
												onChange={(val) => setFilters(prev => ({ ...prev, customStartDate: val }))}
												placeholder="Select start date & time"
											/>
										</div>
										<div>
											<label className="block text-sm font-medium text-text-secondary mb-2">
												End Date
											</label>
											<DateTimePicker
												value={filters.customEndDate || ''}
												onChange={(val) => setFilters(prev => ({ ...prev, customEndDate: val }))}
												placeholder="Select end date & time"
											/>
										</div>
									</div>
									<div className="flex justify-end">
										<button
											onClick={() => setFilters(prev => ({ ...prev }))}
											disabled={!filters.customStartDate || !filters.customEndDate}
											className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-bg-base rounded-pill text-sm font-medium hover:brightness-110 transition-all duration-160 ease-dashboard disabled:opacity-40 disabled:cursor-not-allowed"
										>
											<Search size={14} />
											Apply Custom Range
										</button>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Error Display */}
					{error && (
						<div className="bg-danger/5 border border-danger/15 rounded-card p-4">
							<p className="text-danger">{error}</p>
						</div>
					)}

					{/* Summary Cards */}
					{summary && (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[18px]">
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center justify-between mb-2">
									<BarChart3 className="w-5 h-5 text-brand-tertiary" />
									<span className="text-xs text-text-muted">{formatTimeSpan(summary.startTime, summary.endTime)}</span>
								</div>
								<div className="text-2xl font-medium text-text-primary mb-1">
									{(summary.totalReadings || 0).toLocaleString()}
								</div>
								<div className="text-sm text-text-secondary">Data Points</div>
							</div>
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center justify-between mb-2">
									<Battery className="w-5 h-5 text-brand-primary" />
									<span className="text-xs text-text-muted">Average</span>
								</div>
								<div className="text-2xl font-medium text-text-primary mb-1">
									{formatValue(summary.avgBatteryLevel, "%")}
								</div>
								<div className="text-sm text-text-secondary">Battery Level</div>
							</div>
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center justify-between mb-2">
									<BarChart3 className="w-5 h-5 text-warning" />
									<span className="text-xs text-text-muted">Peak: {formatValue(summary.peakPowerOutput, "W")}</span>
								</div>
								<div className="text-2xl font-medium text-text-primary mb-1">
									{formatValue(summary.avgPowerOutput, "W")}
								</div>
								<div className="text-sm text-text-secondary">Avg Power Output</div>
							</div>
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center justify-between mb-2">
									<Thermometer className="w-5 h-5 text-danger" />
									<span className="text-xs text-text-muted">Max: {formatValue(summary.highestTemperature, "°C")}</span>
								</div>
								<div className="text-2xl font-medium text-text-primary mb-1">
									{formatValue(summary.avgTemperature, "°C")}
								</div>
								<div className="text-sm text-text-secondary">Avg Temperature</div>
							</div>
						</div>
					)}

					{/* Charts Section */}
					<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px] mt-6">
						<h3 className="text-section-title font-medium text-text-primary mb-6">Power Usage Trends</h3>
						{isLoading ? (
							<div className="flex items-center justify-center h-64">
								<div className="text-center">
									<Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
									<p className="text-text-secondary">Loading chart data...</p>
								</div>
							</div>
						) : chartReadings.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-64 text-center">
								<BarChart3 className="w-16 h-16 text-text-muted mb-4" />
								<h3 className="text-lg font-medium text-text-secondary mb-2">No Analytics Data</h3>
								<p className="text-text-muted mb-4">
									No data available for analytics.
								</p>
								<Link
									href="/devices"
									className="flex items-center gap-2 bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 text-sm"
								>
									<ExternalLink size={16} />
									Manage Devices
								</Link>
							</div>
						) : (
							<CombinedChart
								data={transformReadingsToChartData(chartReadings)}
								height={400}
								defaultChart="power"
							/>
						)}
					</div>

					{/* Additional Chart Views */}
					{chartReadings.length > 0 && (
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px] mt-6">
							{/* Battery Level Chart */}
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center gap-2 mb-4">
									<Battery className="w-5 h-5 text-brand-primary" />
									<h3 className="text-section-title font-medium text-text-primary">Battery Level</h3>
								</div>
								<BatteryLevelChart
									data={transformReadingsToChartData(chartReadings)}
									height={250}
								/>
							</div>

							{/* Temperature Chart */}
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center gap-2 mb-4">
									<Thermometer className="w-5 h-5 text-danger" />
									<h3 className="text-section-title font-medium text-text-primary">Temperature</h3>
								</div>
								<TemperatureChart
									data={transformReadingsToChartData(chartReadings)}
									height={250}
								/>
							</div>
						</div>
					)}
				</div>
			</div>
		
	);
}

export default function AnalyticsPageWrapper() {
	return (
		
			<AnalyticsPage />
		
	);
}
