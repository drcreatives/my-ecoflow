"use client"

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import AuthWrapper from "@/components/AuthWrapper";
import { useDeviceStore } from "@/stores/deviceStore";
import { DeviceReading } from "@/lib/data-utils";
import { CombinedChart, BatteryLevelChart, TemperatureChart, transformReadingsToChartData } from "@/components/charts/HistoryCharts";
import { Loader2, Battery, Thermometer, BarChart3, ExternalLink } from "lucide-react";
import Link from "next/link";

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

function AnalyticsPage() {
	const { devices, fetchDevices, isLoading: devicesLoading } = useDeviceStore();
	const [readings, setReadings] = useState<DeviceReading[]>([]);
	const [summary, setSummary] = useState<HistorySummary | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	useEffect(() => {
		fetchDevices();
	}, [fetchDevices]);

	useEffect(() => {
		if (devices.length > 0) {
			fetchAnalyticsData();
		}
	}, [devices]);

	const fetchAnalyticsData = async () => {
		try {
			setIsLoading(true);
			setError(null);
			// Fetch all readings for analytics
			const response = await fetch(`/api/history/readings?timeRange=24h&aggregation=1h`);
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
			<AppLayout>
				<div className="p-6">
					<div className="flex items-center justify-center h-64">
						<div className="text-center">
							<Loader2 className="w-8 h-8 text-accent-green animate-spin mx-auto mb-4" />
							<p className="text-gray-400">Loading devices...</p>
						</div>
					</div>
				</div>
			</AppLayout>
		);
	}

	return (
		<AppLayout>
			<div className="p-4 sm:p-6">
				<div className="flex flex-col gap-6">
					{/* Header */}
					<div className="flex items-center gap-3 mb-6">
						<BarChart3 size={28} className="text-accent-green" />
						<h1 className="text-2xl sm:text-3xl font-bold">Analytics & Trends</h1>
						{lastUpdated && (
							<span className="text-xs text-gray-500 ml-4">Last updated: {lastUpdated.toLocaleString()}</span>
						)}
					</div>

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
		</AppLayout>
	);
}

export default function AnalyticsPageWrapper() {
	return (
		<AuthWrapper>
			<AnalyticsPage />
		</AuthWrapper>
	);
}
