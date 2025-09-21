import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { prisma } from '@/lib/prisma'

/**
 * Test endpoint to collect readings without authentication
 */
export async function POST(_request: NextRequest) {
  try {
    console.log('📊 Starting test reading collection...')
    
    // Get all registered devices
    const devices = await prisma.device.findMany()

    if (devices.length === 0) {
      return NextResponse.json({ 
        message: 'No devices found in database',
        collected: 0 
      })
    }

    console.log(`📱 Found ${devices.length} device(s) to collect readings for`)

    const results = []
    
    for (const device of devices) {
      try {
        console.log(`🔄 Collecting reading for device: ${device.deviceSn}`)
        
        // Get device quota from EcoFlow API
        const quota = await ecoflowAPI.getDeviceQuota(device.deviceSn)
        
        if (!quota || !quota.quotaMap) {
          console.log(`⚠️ No quota data for device ${device.deviceSn}`)
          continue
        }

        // Helper function to get quota value
        const getQuotaValue = (key: string): number => {
          const value = quota.quotaMap[key]
          if (!value || typeof value.val !== 'number') return 0
          return value.scale ? value.val / Math.pow(10, value.scale) : value.val
        }

        // Extract reading data
        const reading = {
          batteryLevel: getQuotaValue('bms_bmsStatus.soc') || getQuotaValue('pd.soc') || 0,
          inputWatts: getQuotaValue('inv.inputWatts') || getQuotaValue('pd.wattsInSum') || 0,
          outputWatts: getQuotaValue('pd.wattsOutSum') || getQuotaValue('inv.outputWatts') || 0,
          temperature: getQuotaValue('bms_bmsStatus.temp') || 20,
          remainingTime: getQuotaValue('pd.remainTime') || null,
          status: 'connected',
          rawData: quota.quotaMap
        }

        // Save to database
        const savedReading = await prisma.deviceReading.create({
          data: {
            deviceId: device.id,
            batteryLevel: reading.batteryLevel,
            inputWatts: reading.inputWatts,
            outputWatts: reading.outputWatts,
            remainingTime: reading.remainingTime,
            temperature: reading.temperature,
            status: reading.status,
            rawData: JSON.parse(JSON.stringify(reading.rawData || {}))
          }
        })

        console.log(`✅ Saved reading for ${device.deviceSn} - Battery: ${reading.batteryLevel}%, Output: ${reading.outputWatts}W`)
        
        results.push({
          deviceSn: device.deviceSn,
          reading: reading,
          savedId: savedReading.id,
          success: true
        })

      } catch (error) {
        console.error(`❌ Failed to collect reading for ${device.deviceSn}:`, error)
        results.push({
          deviceSn: device.deviceSn,
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const errorCount = results.filter(r => !r.success).length

    return NextResponse.json({
      message: `Collection completed`,
      summary: {
        totalDevices: devices.length,
        successful: successCount,
        failed: errorCount
      },
      results
    })

  } catch (error) {
    console.error('❌ Background collection failed:', error)
    return NextResponse.json({
      error: 'Collection failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}