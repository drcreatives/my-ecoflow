import { useQuery, useMutation } from '@tanstack/react-query'
import { systemAPI, handleMutationError } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query'
import { toast } from 'sonner'

// Collection status query
export function useCollectionStatus() {
  return useQuery({
    queryKey: queryKeys.system.collectionStatus,
    queryFn: () => systemAPI.getCollectionStatus(),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes
    refetchIntervalInBackground: false,
  })
}

// Test email mutation
export function useTestEmail() {
  return useMutation({
    mutationFn: () => systemAPI.testEmail(),
    onSuccess: () => {
      toast.success('Test email sent successfully! Check your inbox.')
    },
    onError: (error) => {
      handleMutationError(error, 'Failed to send test email')
    },
  })
}

// Send email mutation
export function useSendEmail() {
  return useMutation({
    mutationFn: (data: any) => systemAPI.sendEmail(data),
    onSuccess: () => {
      toast.success('Email sent successfully!')
    },
    onError: (error) => {
      handleMutationError(error, 'Failed to send email')
    },
  })
}