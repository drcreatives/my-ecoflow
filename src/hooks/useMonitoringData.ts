'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface MonitoringData {
  summary?: {
    totalReadings: number
    totalDevices: number
  }
  recentReadings?: Array<{
    recordedAt: string
  }>
}

export function useMonitoringData() {
  return useQuery<MonitoringData>({
    queryKey: ['monitoring-data'],
    queryFn: () => apiClient.get('/monitor-readings'),
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 30 * 1000, // 30 seconds
    refetchIntervalInBackground: false, // Only refetch when focused
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}