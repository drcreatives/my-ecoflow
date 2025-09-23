import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { deviceAPI, handleMutationError } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query'
import { toast } from 'sonner'

// Device list query
export function useDevices(filters?: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.devices.list(filters),
    queryFn: () => deviceAPI.getDevices(),
    select: (data) => data.devices,
    staleTime: 30 * 1000, // 30 seconds for more frequent updates
    refetchInterval: 60 * 1000, // Background refetch every minute
  })
}

// Single device query
export function useDevice(deviceId: string) {
  return useQuery({
    queryKey: queryKeys.devices.detail(deviceId),
    queryFn: () => deviceAPI.getDevice(deviceId),
    select: (data) => data.device,
    enabled: !!deviceId,
    staleTime: 1 * 60 * 1000, // 1 minute
  })
}

// Device readings query
export function useDeviceReadings(deviceId: string, limit = 100) {
  return useQuery({
    queryKey: queryKeys.devices.readings(deviceId, limit),
    queryFn: () => deviceAPI.getDeviceReadings(deviceId, limit),
    enabled: !!deviceId,
    staleTime: 30 * 1000, // 30 seconds for real-time data
    refetchInterval: 60 * 1000, // Refetch every minute
  })
}

// Latest readings for all devices
export function useLatestReadings() {
  return useQuery({
    queryKey: queryKeys.devices.latestReadings,
    queryFn: () => deviceAPI.getLatestReadings(),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes
  })
}

// Device discovery query
export function useDeviceDiscovery() {
  return useQuery({
    queryKey: ['devices', 'discover'],
    queryFn: () => deviceAPI.discoverDevices(),
    select: (data) => data.devices,
    enabled: false, // Manual trigger only
    staleTime: 0, // Always fresh when triggered
  })
}

// Create device mutation
export function useCreateDevice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => deviceAPI.createDevice(data),
    onSuccess: (data) => {
      // Invalidate and refetch devices list
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.all })
      toast.success('Device created successfully')
      return data.device
    },
    onError: (error) => {
      handleMutationError(error, 'Failed to create device')
    },
  })
}

// Register device mutation
export function useRegisterDevice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => deviceAPI.registerDevice(data),
    onSuccess: (data) => {
      // Invalidate devices list
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.all })
      toast.success('Device registered successfully')
      return data.device
    },
    onError: (error) => {
      handleMutationError(error, 'Failed to register device')
    },
  })
}

// Update device mutation
export function useUpdateDevice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      deviceAPI.updateDevice(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.devices.detail(id) })

      // Snapshot previous value
      const previousDevice = queryClient.getQueryData(queryKeys.devices.detail(id))

      // Optimistically update
      queryClient.setQueryData(queryKeys.devices.detail(id), (old: any) => ({
        ...old,
        ...data,
      }))

      return { previousDevice, id }
    },
    onSuccess: (data, { id }) => {
      // Update the specific device cache
      queryClient.setQueryData(queryKeys.devices.detail(id), data.device)
      // Invalidate devices list to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.all })
      toast.success('Device updated successfully')
    },
    onError: (error, { id }, context) => {
      // Rollback optimistic update
      if (context?.previousDevice) {
        queryClient.setQueryData(queryKeys.devices.detail(id), context.previousDevice)
      }
      handleMutationError(error, 'Failed to update device')
    },
    onSettled: (data, error, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.detail(id) })
    },
  })
}

// Delete device mutation
export function useDeleteDevice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (deviceId: string) => deviceAPI.deleteDevice(deviceId),
    onMutate: async (deviceId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.devices.all })

      // Snapshot previous value
      const previousDevices = queryClient.getQueryData(queryKeys.devices.all)

      // Optimistically remove device from list
      queryClient.setQueriesData(
        { queryKey: queryKeys.devices.all },
        (old: any[]) => old?.filter((device: any) => device.id !== deviceId)
      )

      return { previousDevices, deviceId }
    },
    onSuccess: (data, deviceId) => {
      // Remove device detail from cache
      queryClient.removeQueries({ queryKey: queryKeys.devices.detail(deviceId) })
      // Remove device readings from cache
      queryClient.removeQueries({ queryKey: queryKeys.devices.readings(deviceId) })
      toast.success('Device deleted successfully')
    },
    onError: (error, deviceId, context) => {
      // Rollback optimistic update
      if (context?.previousDevices) {
        queryClient.setQueryData(queryKeys.devices.all, context.previousDevices)
      }
      handleMutationError(error, 'Failed to delete device')
    },
    onSettled: () => {
      // Always refetch devices list
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.all })
    },
  })
}

// Collect readings mutation
export function useCollectReadings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ force = false }: { force?: boolean } = {}) => 
      deviceAPI.collectReadings(force),
    onSuccess: (data) => {
      // Invalidate latest readings and device readings
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.latestReadings })
      queryClient.invalidateQueries({ queryKey: ['devices', 'readings'] })
      
      const successCount = data.summary?.totalSuccessful || 0
      const failedCount = data.summary?.totalFailed || 0
      
      if (successCount > 0) {
        toast.success(`Collection completed: ${successCount} devices updated`)
      }
      if (failedCount > 0) {
        toast.warning(`${failedCount} devices failed to update`)
      }
    },
    onError: (error) => {
      handleMutationError(error, 'Failed to collect readings')
    },
  })
}