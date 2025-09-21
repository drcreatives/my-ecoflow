import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { prisma } from '@/lib/prisma'

/**
 * Vercel Cron Job - Runs every minute to collect device readings
 * This ensures we have continuous data collection for analytics
 * regardless of user activity
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is being called by Vercel Cron
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🕐 [CRON] Starting scheduled reading collection...')
    const startTime = Date.now()

    // Get all devices from all users (for comprehensive data collection)
    const devices = await prisma.device.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    })

    if (devices.length === 0) {
      console.log('ℹ️ [CRON] No devices found in system')
      return NextResponse.json({ 
        message: 'No devices to collect from',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      })
    }

    let successCount = 0
    let errorCount = 0
    const results = []

    console.log(`🔄 [CRON] Processing ${devices.length} devices...`)

    // Process each device
    for (const device of devices) {
      try {
        console.log(`📡 [CRON] Collecting from ${device.deviceSn} (${device.deviceName})`)
        
        // Get current reading from EcoFlow API
        const quota = await ecoflowAPI.getDeviceQuota(device.deviceSn)
        if (!quota || !quota.quotaMap) {
          console.warn(`⚠️ [CRON] No quota data for ${device.deviceSn}`)
          errorCount++
          results.push({
            deviceSn: device.deviceSn,
            status: 'error',
            error: 'No quota data available'
          })
          continue
        }

        // Transform to reading format
        const reading = ecoflowAPI.transformQuotaToReading(quota, device.id)
        
        if (!reading) {
          console.warn(`⚠️ [CRON] Could not transform quota data for ${device.deviceSn}`)
          errorCount++
          results.push({
            deviceSn: device.deviceSn,
            status: 'error',
            error: 'Could not transform quota data'
          })
          continue
        }

        // Save to database
        const savedReading = await prisma.deviceReading.create({
          data: {
            deviceId: device.id,
            batteryLevel: reading.batteryLevel || 0,
            inputWatts: reading.inputWatts || 0,
            outputWatts: reading.outputWatts || 0,
            remainingTime: reading.remainingTime,
            temperature: reading.temperature || 0,
            status: reading.status || 'unknown',
            rawData: reading.rawData as any || {}
          }
        })

        console.log(`✅ [CRON] Saved reading for ${device.deviceSn} - Battery: ${reading.batteryLevel}%, Output: ${reading.outputWatts}W`)
        
        results.push({
          deviceSn: device.deviceSn,
          deviceName: device.deviceName,
          userId: device.userId,
          readingId: savedReading.id,
          batteryLevel: reading.batteryLevel,
          outputWatts: reading.outputWatts,
          inputWatts: reading.inputWatts,
          status: reading.status,
          recordedAt: savedReading.recordedAt
        })
        
        successCount++
        
      } catch (error) {
        console.error(`❌ [CRON] Error collecting from ${device.deviceSn}:`, error)
        errorCount++
        results.push({
          deviceSn: device.deviceSn,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const duration = Date.now() - startTime
    console.log(`📊 [CRON] Collection complete in ${duration}ms: ${successCount} success, ${errorCount} errors`)

    // Clean up old readings (keep last 30 days to prevent database bloat)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const deletedCount = await prisma.deviceReading.deleteMany({
      where: {
        recordedAt: {
          lt: thirtyDaysAgo
        }
      }
    })

    if (deletedCount.count > 0) {
      console.log(`🗑️ [CRON] Cleaned up ${deletedCount.count} old readings (>30 days)`)
    }

    return NextResponse.json({
      message: 'Scheduled reading collection completed',
      timestamp: new Date().toISOString(),
      duration,
      summary: {
        totalDevices: devices.length,
        successful: successCount,
        failed: errorCount,
        cleanedUp: deletedCount.count
      },
      results: process.env.NODE_ENV === 'development' ? results : undefined // Include details in dev only
    })

  } catch (error) {
    console.error('❌ [CRON] Critical error in scheduled collection:', error)
    return NextResponse.json({
      error: 'Scheduled collection failed',
      timestamp: new Date().toISOString(),
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}