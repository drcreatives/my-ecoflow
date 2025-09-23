'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

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

interface AnalyticsResponse {
  readings: any[];
  summary: HistorySummary;
}

export function useAnalyticsData(filters: HistoryFilters) {
  return useQuery<AnalyticsResponse>({
    queryKey: ['analytics', filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        timeRange: filters.timeRange,
        aggregation: filters.aggregation,
      });

      if (filters.deviceId !== 'all') {
        params.set('deviceId', filters.deviceId);
      }

      if (filters.timeRange === 'custom') {
        if (filters.customStartDate) params.set('startDate', filters.customStartDate);
        if (filters.customEndDate) params.set('endDate', filters.customEndDate);
      }

      const response = await apiClient.get(`/history/readings?${params.toString()}`);
      
      // Type assertion for the API response
      const apiResponse = response as { data: { readings: any[], summary: HistorySummary } };
      
      // Transform the data
      const transformedReadings = apiResponse.data.readings.map((reading: any) => ({
        ...reading,
        recordedAt: new Date(reading.recordedAt),
      }));

      return {
        readings: transformedReadings,
        summary: apiResponse.data.summary
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    enabled: !!filters, // Only run query when filters are provided
  })
}