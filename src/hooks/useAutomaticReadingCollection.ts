import { useState, useCallback } from 'react'

interface ReadingCollectionStatus {
  isActive: boolean
  lastCollection: string | null
  successCount: number
  errorCount: number
  currentInterval: number
}

export const useAutomaticReadingCollection = (intervalSeconds: number = 30) => {
  const [status, setStatus] = useState<ReadingCollectionStatus>({
    isActive: false,
    lastCollection: null,
    successCount: 0,
    errorCount: 0,
    currentInterval: intervalSeconds
  })

  const collectReading = useCallback(async () => {
    try {
      console.log('📊 Auto-collecting device reading...')
      
      const response = await fetch('/api/devices/collect-readings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ Reading collection successful:', data.summary)
        
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
      console.error('❌ Reading collection failed:', error)
      
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
    console.log(`🚀 Starting automatic reading collection (every ${intervalSeconds}s)`)
    
    setStatus(prev => ({ 
      ...prev, 
      isActive: true,
      currentInterval: intervalSeconds 
    }))
    
    // Collect immediately on start
    collectReading()
    
    // Set up interval
    const interval = setInterval(collectReading, intervalSeconds * 1000)
    
    return interval
  }, [intervalSeconds, collectReading])

  const stopCollection = useCallback((interval: NodeJS.Timeout) => {
    console.log('⏹️ Stopping automatic reading collection')
    clearInterval(interval)
    setStatus(prev => ({ ...prev, isActive: false }))
  }, [])

  return {
    status,
    startCollection,
    stopCollection,
    collectReading
  }
}