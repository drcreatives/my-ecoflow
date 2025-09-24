"use client"

import { useEffect, useState } from "react";
import { useDeviceStore } from "@/stores/deviceStore";
import { DeviceReading } from "@/lib/data-utils";
import { CombinedChart, BatteryLevelChart, TemperatureChart, transformReadingsToChartData } from "@/components/charts/HistoryCharts";
import { Loader2, Battery, Thermometer, BarChart3, ExternalLink, Filter, RefreshCw, ChevronDown } from "lucide-react";
import Link from "next/link";

// Types for analytics data
interface HistoryFilters {
  deviceId: string | 'all'
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d' | 'custom'
  customStartDate?: string
  customEndDate?: string
  aggregation: 'raw' | '5m' | '1h' | '1d'
}

interface HistorySummary {
	totalReadings: number;
	avgBatteryLevel: number;
	avgPowerOutput: number;
	avgTemperature: number;
	peakPowerOutput: number;
	lowestBatteryLevel: number;
	highestTemperature: number;
	timeSpan: string;
}

interface DeviceOption {
  id: string
  name: string
  sn: string
  isActive: boolean
}

function AnalyticsPage() {
	const { devices, fetchDevices, isLoading: devicesLoading } = useDeviceStore();
	const [readings, setReadings] = useState<DeviceReading[]>([]);
	const [summary, setSummary] = useState<HistorySummary | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

	useEffect(() => {
		fetchDevices();
	}, [fetchDevices]);

	useEffect(() => {
		if (devices.length > 0) {
			fetchAnalyticsData();
		}
	}, [devices, filters]);

	const fetchAnalyticsData = async () => {
		try {
			setIsLoading(true);
			setError(null);
			
			// Build query parameters based on filters
			const params = new URLSearchParams({
				timeRange: filters.timeRange,
				aggregation: filters.aggregation
			});

			if (filters.deviceId !== 'all') {
				params.set('deviceId', filters.deviceId);
			}

			if (filters.timeRange === 'custom') {
				if (filters.customStartDate) params.set('startDate', filters.customStartDate);
				if (filters.customEndDate) params.set('endDate', filters.customEndDate);
			}

			const response = await fetch(`/api/history/readings?${params.toString()}`);
			const data = await response.json();
			if (!data.success) throw new Error(data.error || "Failed to fetch analytics data");
			const apiReadings = data.data.readings.map((reading: any) => ({
				...reading,
				recordedAt: new Date(reading.recordedAt),
			}));
			setReadings(apiReadings);
			setSummary(data.data.summary);
			setLastUpdated(new Date());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load analytics data");
		} finally {
			setIsLoading(false);
		}
	};

	const formatValue = (value: number | null | undefined, unit: string) => {
		if (value === null || value === undefined || isNaN(value)) return "0" + unit;
		return value.toFixed(1) + unit;
	};

	if (devicesLoading) {
		return (
			
				<div className="p-6">
					<div className="flex items-center justify-center h-64">
						<div className="text-center">
							<Loader2 className="w-8 h-8 text-accent-green animate-spin mx-auto mb-4" />
							<p className="text-gray-400">Loading devices...</p>
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
							<BarChart3 size={28} className="text-accent-green" />
							<h1 className="text-2xl sm:text-3xl font-bold">Analytics & Trends</h1>
						</div>
						
						<div className="flex items-center gap-2">
							{lastUpdated && (
								<span className="text-xs text-gray-500">Last updated: {lastUpdated.toLocaleString()}</span>
							)}
							<button
								onClick={() => setShowFilters(!showFilters)}
								className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-white transition-colors"
							>
								<Filter size={16} />
								Filters
							</button>
							<button
								onClick={fetchAnalyticsData}
								disabled={isLoading}
								className="flex items-center gap-2 px-3 py-2 bg-accent-green hover:bg-accent-green/90 disabled:opacity-50 disabled:cursor-not-allowed text-black font-medium rounded-lg transition-colors"
							>
								<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
								Refresh
							</button>
						</div>
					</div>

					{/* Filters Panel */}
					{showFilters && (
						<div className="bg-primary-dark border border-gray-700 rounded-lg p-6">
							<h3 className="text-lg font-semibold text-white mb-4">Data Filters</h3>
							
							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								{/* Device Selection */}
								<div>
									<label className="block text-sm font-medium text-gray-300 mb-2">
										Device
									</label>
									<div className="relative">
										<select
											value={filters.deviceId}
											onChange={(e) => setFilters(prev => ({ ...prev, deviceId: e.target.value }))}
											className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green appearance-none pr-10"
										>
											{deviceOptions.map(device => (
												<option key={device.id} value={device.id}>
													{device.name} {device.sn && `(${device.sn})`}
												</option>
											))}
										</select>
										<ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
									</div>
								</div>

								{/* Time Range */}
								<div>
									<label className="block text-sm font-medium text-gray-300 mb-2">
										Time Range
									</label>
									<div className="relative">
										<select
											value={filters.timeRange}
											onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as any }))}
											className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green appearance-none pr-10"
										>
											<option value="1h">Last Hour</option>
											<option value="6h">Last 6 Hours</option>
											<option value="24h">Last 24 Hours</option>
											<option value="7d">Last 7 Days</option>
											<option value="30d">Last 30 Days</option>
											<option value="custom">Custom Range</option>
										</select>
										<ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
									</div>
								</div>

								{/* Data Aggregation */}
								<div>
									<label className="block text-sm font-medium text-gray-300 mb-2">
										Data Points
									</label>
									<div className="relative">
										<select
											value={filters.aggregation}
											onChange={(e) => setFilters(prev => ({ ...prev, aggregation: e.target.value as any }))}
											className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green appearance-none pr-10"
										>
											<option value="raw">Raw Data</option>
											<option value="5m">5 Minute Average</option>
											<option value="1h">Hourly Average</option>
											<option value="1d">Daily Average</option>
										</select>
										<ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
									</div>
								</div>
							</div>

							{filters.timeRange === 'custom' && (
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
									<div>
										<label className="block text-sm font-medium text-gray-300 mb-2">
											Start Date
										</label>
										<input
											type="datetime-local"
											value={filters.customStartDate || ''}
											onChange={(e) => setFilters(prev => ({ ...prev, customStartDate: e.target.value }))}
											className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
										/>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-300 mb-2">
											End Date
										</label>
										<input
											type="datetime-local"
											value={filters.customEndDate || ''}
											onChange={(e) => setFilters(prev => ({ ...prev, customEndDate: e.target.value }))}
											className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
										/>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Error Display */}
					{error && (
						<div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
							<p className="text-red-300">{error}</p>
						</div>
					)}

					{/* Summary Cards */}
					{summary && (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
							<div className="bg-primary-dark border border-blue-500/20 rounded-lg p-4">
								<div className="flex items-center justify-between mb-2">
									<BarChart3 className="w-5 h-5 text-blue-400" />
									<span className="text-xs text-gray-400">{summary.timeSpan || "0 hours"}</span>
								</div>
								<div className="text-2xl font-bold text-white mb-1">
									{(summary.totalReadings || 0).toLocaleString()}
								</div>
								<div className="text-sm text-gray-400">Data Points</div>
							</div>
							<div className="bg-primary-dark border border-green-500/20 rounded-lg p-4">
								<div className="flex items-center justify-between mb-2">
									<Battery className="w-5 h-5 text-green-400" />
									<span className="text-xs text-gray-400">Average</span>
								</div>
								<div className="text-2xl font-bold text-white mb-1">
									{formatValue(summary.avgBatteryLevel, "%")}
								</div>
								<div className="text-sm text-gray-400">Battery Level</div>
							</div>
							<div className="bg-primary-dark border border-yellow-500/20 rounded-lg p-4">
								<div className="flex items-center justify-between mb-2">
									<BarChart3 className="w-5 h-5 text-yellow-400" />
									<span className="text-xs text-gray-400">Peak: {formatValue(summary.peakPowerOutput, "W")}</span>
								</div>
								<div className="text-2xl font-bold text-white mb-1">
									{formatValue(summary.avgPowerOutput, "W")}
								</div>
								<div className="text-sm text-gray-400">Avg Power Output</div>
							</div>
							<div className="bg-primary-dark border border-red-500/20 rounded-lg p-4">
								<div className="flex items-center justify-between mb-2">
									<Thermometer className="w-5 h-5 text-red-400" />
									<span className="text-xs text-gray-400">Max: {formatValue(summary.highestTemperature, "°C")}</span>
								</div>
								<div className="text-2xl font-bold text-white mb-1">
									{formatValue(summary.avgTemperature, "°C")}
								</div>
								<div className="text-sm text-gray-400">Avg Temperature</div>
							</div>
						</div>
					)}

					{/* Charts Section */}
					<div className="bg-primary-dark border border-gray-700 rounded-lg p-6 mt-6">
						<h3 className="text-xl font-semibold text-white mb-6">Power Usage Trends</h3>
						{isLoading ? (
							<div className="flex items-center justify-center h-64">
								<div className="text-center">
									<Loader2 className="w-8 h-8 text-accent-green animate-spin mx-auto mb-4" />
									<p className="text-gray-400">Loading chart data...</p>
								</div>
							</div>
						) : readings.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-64 text-center">
								<BarChart3 className="w-16 h-16 text-gray-600 mb-4" />
								<h3 className="text-lg font-semibold text-gray-400 mb-2">No Analytics Data</h3>
								<p className="text-gray-500 mb-4">
									No data available for analytics.
								</p>
								<Link
									href="/devices"
									className="flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 text-black font-medium py-2 px-4 rounded-lg transition-colors"
								>
									<ExternalLink size={16} />
									Manage Devices
								</Link>
							</div>
						) : (
							<CombinedChart
								data={transformReadingsToChartData(readings)}
								height={400}
								defaultChart="power"
							/>
						)}
					</div>

					{/* Additional Chart Views */}
					{readings.length > 0 && (
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
							{/* Battery Level Chart */}
							<div className="bg-primary-dark border border-gray-700 rounded-lg p-6">
								<div className="flex items-center gap-2 mb-4">
									<Battery className="w-5 h-5 text-green-400" />
									<h3 className="text-lg font-semibold text-white">Battery Level</h3>
								</div>
								<BatteryLevelChart
									data={transformReadingsToChartData(readings)}
									height={250}
								/>
							</div>

							{/* Temperature Chart */}
							<div className="bg-primary-dark border border-gray-700 rounded-lg p-6">
								<div className="flex items-center gap-2 mb-4">
									<Thermometer className="w-5 h-5 text-red-400" />
									<h3 className="text-lg font-semibold text-white">Temperature</h3>
								</div>
								<TemperatureChart
									data={transformReadingsToChartData(readings)}
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
