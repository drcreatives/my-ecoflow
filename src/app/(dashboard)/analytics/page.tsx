"use client"

import { useEffect, useState, useMemo } from "react";
import { useConvexDevices, useConvexHistoryReadings } from "@/hooks/useConvexData";
import { CombinedChart, BatteryLevelChart, TemperatureChart, ChartZoomControls, transformReadingsToChartData, transformTemperatureReadingsToChartData, type ChartRange } from "@/components/charts/HistoryCharts";
import { Loader2, Battery, Thermometer, BarChart3, ExternalLink, Filter, ChevronDown, Search, Zap, Plug, Sun } from "lucide-react";
import Link from "next/link";
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import type { InputQuality } from "@/lib/reading-status";
import { formatMeasurementValue as formatValue, type DeviceReading } from "@/lib/data-utils";
import { selectTemperatureHistoryWindow } from '@/lib/temperature-history';

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

function formatDuration(milliseconds: number): string {
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1000)} sec`;
  const hours = milliseconds / 3_600_000;
  const value = hours >= 1 ? hours : milliseconds / 60_000;
  return `${value.toFixed(1).replace(/\.0$/, '')} ${hours >= 1 ? 'hr' : 'min'}`;
}

function formatCoverage(coveredMs: number, selectedMs: number): string {
  return `${coveredMs < selectedMs ? 'Partial coverage' : 'Coverage'}: ${formatDuration(coveredMs)} of ${formatDuration(selectedMs)} selected`;
}

// interface HistorySummary {
// 	totalReadings: number;
// 	avgBatteryLevel: number;
// 	avgPowerOutput: number;
// 	avgTemperature: number;
// 	peakPowerOutput: number;
// 	lowestBatteryLevel: number;
// 	highestTemperature: number;
// 	startTime: number;
// 	endTime: number;
// }

/** Shape of a single reading returned by the Convex history query. */
interface HistoryReading extends DeviceReading {
  deviceId: string;
  deviceName: string;
  deviceSn: string;
  batteryLevel: number | null;
  inputWatts: number | null;
  acInputWatts: number | null;
  dcInputWatts: number | null;
  chargingType: number | null;
  inputQuality?: InputQuality | null;
  outputWatts: number | null;
  acOutputWatts: number | null;
  dcOutputWatts: number | null;
  usbOutputWatts: number | null;
  remainingTime: number | null;
  temperature: number | null;
  status: string;
  recordedAt: number;
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

	// const selectedDevice = deviceOptions.find(d => d.id === filters.deviceId);

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
		samplingIntervalMs,
		temperatureReadings,
		temperatureSamplingIntervalMs,
		temperatureSampledReadings,
		temperatureSummary,
		energyTotals,
		sampledReadings,
		collectionIntervalMinutes,
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
		(readings as HistoryReading[]).map((r) => ({
			...r,
			recordedAt: new Date(r.recordedAt),
		})),
		[readings]
	);
	const chartData = useMemo(
		() => transformReadingsToChartData(chartReadings, {
			aggregation: filters.aggregation,
			samplingIntervalMs,
			collectionIntervalMinutes,
		}),
		[chartReadings, filters.aggregation, samplingIntervalMs, collectionIntervalMinutes]
	);
	const temperatureChartData = useMemo(
		() => transformTemperatureReadingsToChartData(temperatureReadings ?? [], filters.aggregation),
		[temperatureReadings, filters.aggregation]
	);
	const [chartRange, setChartRange] = useState<ChartRange>({
		startIndex: 0,
		endIndex: 0,
	});
	const firstChartTimestamp = chartData[0]?.timestamp;
	const lastChartTimestamp = chartData.at(-1)?.timestamp;

	useEffect(() => {
		setChartRange({
			startIndex: 0,
			endIndex: Math.max(0, chartData.length - 1),
		});
	}, [chartData.length, firstChartTimestamp, lastChartTimestamp]);

	const visibleChartData = useMemo(() => {
		if (chartData.length === 0) return [];
		const startIndex = Math.min(chartRange.startIndex, chartData.length - 1);
		const endIndex = Math.max(
			startIndex,
			Math.min(chartRange.endIndex, chartData.length - 1)
		);
		return chartData.slice(startIndex, endIndex + 1);
	}, [chartData, chartRange]);
	const visibleTemperatureChartData = useMemo(() => selectTemperatureHistoryWindow(
		temperatureChartData, chartData, chartRange,
		{ raw: 0, '5m': 300_000, '1h': 3_600_000, '1d': 86_400_000 }[filters.aggregation]
	), [temperatureChartData, chartData, chartRange, filters.aggregation]);

	// The backend integrates the bounded original sample before chart averaging.
	const selectedDurationMs = summary ? summary.endTime - summary.startTime : 0;
	const temperatureStats = temperatureSummary ?? (summary ? {
		avgTemperature: summary.avgTemperature, maxTemperature: summary.highestTemperature,
	} : null);
	const hasSourceEnergy = (energyTotals?.sourceIntervals ?? 0) > 0;
	const hasStationSolarEnergy = (energyTotals?.solarIntervals ?? 0) > 0;
	const hasPanelEnergy = (energyTotals?.solarPanelIntervals ?? 0) > 0;
	const formatEnergy = (value: number | null | undefined) => {
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
		if (value > 0 && value < 0.01) return '<0.01';
		return value < 10 ? value.toFixed(2) : value.toFixed(1);
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
											onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as HistoryFilters['timeRange'] }))}
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
											onChange={(e) => setFilters(prev => ({ ...prev, aggregation: e.target.value as HistoryFilters['aggregation'] }))}
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
					{samplingIntervalMs !== null && samplingIntervalMs > 0 && (
						<p className="text-xs text-text-muted" role="note">
							Sampled history: approximately one reading per {(samplingIntervalMs / 60_000).toFixed(1)} minutes before averaging.
							{' '}Summaries and charts cover the displayed sample, not every stored reading.
						</p>
					)}
					{(summary || temperatureSummary) && (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[18px]">
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center justify-between mb-2">
									<BarChart3 className="w-5 h-5 text-brand-tertiary" />
									<span className="text-xs text-text-muted">{summary ? formatTimeSpan(summary.startTime, summary.endTime) : 'Temperature observations'}</span>
								</div>
								<div className="text-2xl font-medium text-text-primary mb-1">
									{(summary?.totalReadings ?? 0).toLocaleString()}
								</div>
								<div className="text-sm text-text-secondary">Power Data Points</div>
							</div>
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center justify-between mb-2">
									<Battery className="w-5 h-5 text-brand-primary" />
									<span className="text-xs text-text-muted">Average</span>
								</div>
								<div className="text-2xl font-medium text-text-primary mb-1">
									{formatValue(readings.length ? summary?.avgBatteryLevel : null, "%")}
								</div>
								<div className="text-sm text-text-secondary">Battery Level</div>
							</div>
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center justify-between mb-2">
									<BarChart3 className="w-5 h-5 text-warning" />
									<span className="text-xs text-text-muted">Peak: {formatValue(readings.length ? summary?.peakPowerOutput : null, "W")}</span>
								</div>
								<div className="text-2xl font-medium text-text-primary mb-1">
									{formatValue(readings.length ? summary?.avgPowerOutput : null, "W")}
								</div>
								<div className="text-sm text-text-secondary">Avg Power Output</div>
							</div>
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center justify-between mb-2">
									<Thermometer className="w-5 h-5 text-danger" />
									<span className="text-xs text-text-muted">Max: {formatValue(temperatureStats?.maxTemperature, "°C")}</span>
								</div>
								<div className="text-2xl font-medium text-text-primary mb-1">
									{formatValue(temperatureStats?.avgTemperature, "°C")}
								</div>
								<div className="text-sm text-text-secondary">Avg Temperature</div>
								<div className="text-xs text-text-muted mt-1">
									{(temperatureSampledReadings ?? 0).toLocaleString()} temperature readings{temperatureSamplingIntervalMs ? ' (sampled)' : ''}
								</div>
							</div>
						</div>
					)}

					{/* Energy Totals Cards */}
					{summary && (
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
							{/* Energy Consumed */}
							<div role="group" aria-label="Energy consumed" className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6 flex flex-col gap-2">
								<div className="flex items-center gap-2 mb-1">
									<Zap className="w-6 h-6 text-warning" />
									<span className="text-sm text-text-secondary">Energy Consumed</span>
								</div>
								<div className="text-metric text-text-primary">
									{readings.length ? formatEnergy(energyTotals?.consumed) : '—'}
								</div>
								<span className="text-sm text-text-muted">kWh</span>
							</div>

							{/* AC Input */}
							<div role="group" aria-label="AC input energy" className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6 flex flex-col gap-2">
								<div className="flex items-center gap-2 mb-1">
									<Plug className="w-6 h-6 text-brand-tertiary" />
									<span className="text-sm text-text-secondary">AC Input</span>
								</div>
								<div className="text-metric text-text-primary">
									{hasSourceEnergy ? formatEnergy(energyTotals?.acInput) : '—'}
								</div>
								<span className="text-sm text-text-muted">kWh</span>
								<span className="text-xs text-text-muted">
									{hasSourceEnergy && energyTotals ? formatCoverage(energyTotals.sourceCoveredMs, selectedDurationMs) : 'AC/DC split unavailable: no verified source intervals'}
								</span>
							</div>

							{/* Independent panel measurement */}
							<div role="group" aria-label="Solar panel energy" className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6 flex flex-col gap-2">
								<div className="flex items-center gap-2 mb-1">
									<Sun className="w-6 h-6 text-brand-secondary" />
									<span className="text-sm text-text-secondary">Solar panels</span>
								</div>
								<div className="text-metric text-text-primary">
									{hasPanelEnergy ? formatEnergy(energyTotals?.solarPanelInput) : '—'}
								</div>
								<span className="text-sm text-text-muted">kWh</span>
								<span className="text-xs text-text-muted">
									Separate panel measurement. {hasPanelEnergy && energyTotals ? formatCoverage(energyTotals.solarPanelCoveredMs, selectedDurationMs) : 'Panel energy unavailable: no verified panel intervals'}
								</span>
								<div className="mt-1 border-t border-stroke-subtle pt-3 text-xs text-text-muted space-y-2">
									<div>
										<p>Station DC: {hasSourceEnergy ? `${formatEnergy(energyTotals?.dcInput)} kWh` : 'Unavailable'}</p>
										{hasSourceEnergy && energyTotals && <p>{formatCoverage(energyTotals.sourceCoveredMs, selectedDurationMs)}</p>}
									</div>
									<div>
										<p>Confirmed station solar: {hasStationSolarEnergy ? `${formatEnergy(energyTotals?.solarInput)} kWh` : 'Unavailable'}</p>
										{hasStationSolarEnergy && energyTotals && <p>{formatCoverage(energyTotals.solarCoveredMs, selectedDurationMs)}</p>}
									</div>
								</div>
							</div>
						</div>
					)}
					{summary && (
						<p className="text-xs text-text-muted">
							Energy is estimated from {(sampledReadings ?? 0).toLocaleString()} {samplingIntervalMs ? 'sampled ' : ''}readings before chart averaging; gaps and unverified intervals are excluded.
							{' '}Panel energy uses its own report times and is separate from station AC/DC totals. Unclassified station input: {readings.length ? formatEnergy(energyTotals?.unattributedInput) : '—'} kWh.
						</p>
					)}

					{/* Charts Section */}
					<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px] mt-6">
						<div className="flex flex-col gap-4 mb-6">
							<h3 className="text-section-title font-medium text-text-primary">Power Usage Trends</h3>
							{chartData.length > 1 && (
								<ChartZoomControls
									data={chartData}
									range={chartRange}
									onRangeChange={setChartRange}
								/>
							)}
						</div>
						{isLoading ? (
							<div className="flex items-center justify-center h-64">
								<div className="text-center">
									<Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
									<p className="text-text-secondary">Loading chart data...</p>
								</div>
							</div>
						) : chartReadings.length === 0 && temperatureChartData.length === 0 ? (
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
								data={visibleChartData}
								temperatureData={visibleTemperatureChartData}
								height={400}
								defaultChart={chartData.length ? 'power' : 'temperature'}
							/>
						)}
					</div>

					{/* Additional Chart Views */}
					{(chartReadings.length > 0 || temperatureChartData.length > 0) && (
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px] mt-6">
							{/* Battery Level Chart */}
							{chartReadings.length > 0 && <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center gap-2 mb-4">
									<Battery className="w-5 h-5 text-brand-primary" />
									<h3 className="text-section-title font-medium text-text-primary">Battery Level</h3>
								</div>
								<BatteryLevelChart
									data={visibleChartData}
									height={250}
								/>
							</div>}

							{/* Temperature Chart */}
							<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
								<div className="flex items-center gap-2 mb-4">
									<Thermometer className="w-5 h-5 text-danger" />
									<h3 className="text-section-title font-medium text-text-primary">Temperature</h3>
								</div>
								<TemperatureChart
									data={visibleTemperatureChartData}
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
