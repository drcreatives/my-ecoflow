'use client'

import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export type MockMeter = FunctionReturnType<typeof api.mockMeters.list>[number]
export type MockMeterDetail = NonNullable<FunctionReturnType<typeof api.mockMeters.get>>

const emptyFleet: MockMeter[] = []

export function useMeterFleet() {
  const meters = useQuery(api.mockMeters.list, {})
  return { meters: meters ?? emptyFleet, isLoading: meters === undefined }
}

export function useMeterDetail(meterId: Id<'mockMeters'>) {
  return useQuery(api.mockMeters.get, { meterId })
}

export function useSeedMeters() {
  return useMutation(api.mockMeters.seed)
}

export function useMeterActions() {
  return {
    topUp: useMutation(api.mockMeters.topUp),
    setManualHold: useMutation(api.mockMeters.setManualHold),
    simulateUsage: useMutation(api.mockMeters.simulateUsage),
  }
}
