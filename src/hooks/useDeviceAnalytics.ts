'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

interface RegisterDeviceRequest {
  deviceSn: string
  userId: string
}

interface UnregisterDeviceRequest {
  deviceSn: string
  userId: string
}

export function useRegisterDeviceForAnalytics() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: RegisterDeviceRequest) =>
      apiClient.post('/register-device', data),
    onSuccess: () => {
      // Invalidate devices queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['latest-readings'] })
      toast.success('Device registered for analytics successfully!')
    },
    onError: (error) => {
      console.error('Registration error:', error)
      toast.error('Failed to register device for analytics. Please try again.')
    },
  })
}

export function useUnregisterDeviceFromAnalytics() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UnregisterDeviceRequest) =>
      apiClient.post('/unregister-device', data),
    onSuccess: () => {
      // Invalidate devices queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['latest-readings'] })
      toast.success('Device unregistered from analytics successfully!')
    },
    onError: (error) => {
      console.error('Unregistration error:', error)
      toast.error('Failed to unregister device from analytics. Please try again.')
    },
  })
}