'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface ReadingCollectionStatus {
  isActive: boolean
  lastCollection: string | null
  successCount: number
  errorCount: number
  intervalMinutes: number
}

/**
 * Client-side reading collection for Vercel Free Plan
 * Collects readings every 5 minutes when user is active
 * Pauses when tab is hidden to save API calls
 */
export const useClientSideReadingCollection = (intervalMinutes: number = 5) => {
  const [status, setStatus] = useState<ReadingCollectionStatus>({
    isActive: false,
    lastCollection: null,
    successCount: 0,
    errorCount: 0,
    intervalMinutes
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isDocumentVisible = useRef(true)

  const collectReading = useCallback(async () => {
    // Don't collect if document is hidden (user switched tabs)
    if (!isDocumentVisible.current) {
      console.log('📱 Skipping reading collection - tab not visible')
      return { success: false, reason: 'tab_hidden' }
    }

    try {
      console.log('📊 [GLOBAL] Client collecting device reading...')
      
      const response = await fetch('/api/devices/collect-readings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ [GLOBAL] Client reading collection successful:', data.summary)
        
        setStatus(prev => ({
          ...prev,
          lastCollection: new Date().toISOString(),
          successCount: prev.successCount + 1
        }))
        
        return { success: true, data }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      console.error('❌ Client reading collection failed:', error)
      
      setStatus(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1
      }))
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }, [])

  const startCollection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    console.log(`🚀 [GLOBAL] Starting client-side reading collection (every ${intervalMinutes} minutes)`)
    
    setStatus(prev => ({ 
      ...prev, 
      isActive: true,
      intervalMinutes 
    }))
    
    // Collect immediately on start
    collectReading()
    
    // Set up interval (convert minutes to milliseconds)
    intervalRef.current = setInterval(collectReading, intervalMinutes * 60 * 1000)
    
  }, [intervalMinutes, collectReading])

  const stopCollection = useCallback(() => {
    console.log('⏹️ Stopping client-side reading collection')
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    
    setStatus(prev => ({ ...prev, isActive: false }))
  }, [])

  // Handle document visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      isDocumentVisible.current = !document.hidden
      
      if (document.hidden) {
        console.log('👁️ Dashboard hidden - pausing collection')
      } else {
        console.log('👁️ Dashboard visible - resuming collection')
        // If collection was active and we're now visible, restart
        if (status.isActive) {
          startCollection()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [status.isActive, startCollection])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return {
    status,
    startCollection,
    stopCollection,
    collectReading
  }
}