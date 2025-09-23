import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userAPI, handleMutationError } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query'
import { toast } from 'sonner'

// User profile query
export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile.info,
    queryFn: () => userAPI.getProfile(),
    select: (data) => data.profile,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Notification settings query
export function useNotificationSettings() {
  return useQuery({
    queryKey: queryKeys.profile.notifications,
    queryFn: () => userAPI.getNotificationSettings(),
    select: (data) => data.settings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Data retention settings query
export function useDataRetentionSettings() {
  return useQuery({
    queryKey: queryKeys.profile.dataRetention,
    queryFn: () => userAPI.getDataRetentionSettings(),
    select: (data) => data.settings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Session settings query
export function useSessionSettings() {
  return useQuery({
    queryKey: queryKeys.profile.sessionSettings,
    queryFn: () => userAPI.getSessionSettings(),
    select: (data) => data.settings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Update profile mutation
export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => userAPI.updateProfile(data),
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.profile.info })

      // Snapshot previous value
      const previousProfile = queryClient.getQueryData(queryKeys.profile.info)

      // Optimistically update
      queryClient.setQueryData(queryKeys.profile.info, (old: any) => ({
        ...old,
        ...newData,
      }))

      return { previousProfile }
    },
    onSuccess: (data) => {
      // Update cache with server response
      queryClient.setQueryData(queryKeys.profile.info, data.profile)
      toast.success('Profile updated successfully')
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousProfile) {
        queryClient.setQueryData(queryKeys.profile.info, context.previousProfile)
      }
      handleMutationError(error, 'Failed to update profile')
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.info })
    },
  })
}

// Change password mutation
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => 
      userAPI.changePassword(data),
    onSuccess: () => {
      toast.success('Password changed successfully. Please sign in again with your new password.')
      // Optionally redirect to login
      // window.location.href = '/login'
    },
    onError: (error) => {
      handleMutationError(error, 'Failed to change password')
    },
  })
}

// Update notification settings mutation
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => userAPI.updateNotificationSettings(data),
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.profile.notifications })

      // Snapshot previous value
      const previousSettings = queryClient.getQueryData(queryKeys.profile.notifications)

      // Optimistically update
      queryClient.setQueryData(queryKeys.profile.notifications, (old: any) => ({
        ...old,
        ...newData,
      }))

      return { previousSettings }
    },
    onSuccess: (data) => {
      // Update cache with server response
      queryClient.setQueryData(queryKeys.profile.notifications, data.settings)
      toast.success('Notification settings updated successfully')
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.profile.notifications, context.previousSettings)
      }
      handleMutationError(error, 'Failed to update notification settings')
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.notifications })
    },
  })
}

// Update data retention settings mutation
export function useUpdateDataRetentionSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => userAPI.updateDataRetentionSettings(data),
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.profile.dataRetention })

      // Snapshot previous value
      const previousSettings = queryClient.getQueryData(queryKeys.profile.dataRetention)

      // Optimistically update
      queryClient.setQueryData(queryKeys.profile.dataRetention, (old: any) => ({
        ...old,
        ...newData,
      }))

      return { previousSettings }
    },
    onSuccess: (data) => {
      // Update cache with server response
      queryClient.setQueryData(queryKeys.profile.dataRetention, data.settings)
      // Also invalidate collection status as interval might have changed
      queryClient.invalidateQueries({ queryKey: queryKeys.system.collectionStatus })
      toast.success('Data settings updated successfully')
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.profile.dataRetention, context.previousSettings)
      }
      handleMutationError(error, 'Failed to update data settings')
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.dataRetention })
    },
  })
}

// Update session settings mutation
export function useUpdateSessionSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => userAPI.updateSessionSettings(data),
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.profile.sessionSettings })

      // Snapshot previous value
      const previousSettings = queryClient.getQueryData(queryKeys.profile.sessionSettings)

      // Optimistically update
      queryClient.setQueryData(queryKeys.profile.sessionSettings, (old: any) => ({
        ...old,
        ...newData,
      }))

      return { previousSettings }
    },
    onSuccess: (data) => {
      // Update cache with server response
      queryClient.setQueryData(queryKeys.profile.sessionSettings, data.settings)
      toast.success('Session settings updated successfully')
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.profile.sessionSettings, context.previousSettings)
      }
      handleMutationError(error, 'Failed to update session settings')
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.sessionSettings })
    },
  })
}

// Export data mutation
export function useExportData() {
  return useMutation({
    mutationFn: ({ format = 'json' }: { format?: string } = {}) => 
      userAPI.exportData(format),
    onSuccess: () => {
      toast.success('Data export completed successfully')
    },
    onError: (error) => {
      handleMutationError(error, 'Failed to export data')
    },
  })
}