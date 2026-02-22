import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { executeQuery } from '@/lib/database'

interface CronDevice {
  id: string
  deviceSn: string
  deviceName: string | null
  userId: string
  userEmail: string
}

/**
 * Vercel Cron Job - Runs every minute to collect device readings
 * This ensures we have continuous data collection for analytics
 * regardless of user activity
 * 
 * Uses direct SQL (executeQuery) instead of Prisma to avoid
 * prepared statement conflicts in serverless environments.
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
    const devices = await executeQuery<CronDevice>(
      `SELECT d.id, d.device_sn as "deviceSn", d.device_name as "deviceName",
              d.user_id as "userId", u.email as "userEmail"
       FROM devices d
       JOIN users u ON d.user_id = u.id
       WHERE d.is_active = true`
    )

    if (!devices || devices.length === 0) {
      console.log('ℹ️ [CRON] No devices found in system')
      return NextResponse.json({ 
        message: 'No devices to collect from',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      })
    }

    let successCount = 0
    let errorCount = 0
    const results: any[] = []

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

        // Save to database using direct SQL
        const savedRows = await executeQuery<{ id: string; recorded_at: string }>(
          `INSERT INTO device_readings (
            id, device_id, battery_level, input_watts, ac_input_watts, dc_input_watts,
            charging_type, output_watts, ac_output_watts, dc_output_watts, usb_output_watts,
            remaining_time, temperature, status, raw_data, recorded_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()
          ) RETURNING id, recorded_at`,
          [
            device.id,
            reading.batteryLevel || 0,
            reading.inputWatts || 0,
            reading.acInputWatts || 0,
            reading.dcInputWatts || 0,
            reading.chargingType ?? null,
            reading.outputWatts || 0,
            reading.acOutputWatts || 0,
            reading.dcOutputWatts || 0,
            reading.usbOutputWatts || 0,
            reading.remainingTime ?? null,
            reading.temperature || 0,
            reading.status || 'unknown',
            JSON.stringify(reading.rawData || {})
          ]
        )

        const savedReading = savedRows?.[0]
        console.log(`✅ [CRON] Saved reading for ${device.deviceSn} - Battery: ${reading.batteryLevel}%, Output: ${reading.outputWatts}W`)
        
        results.push({
          deviceSn: device.deviceSn,
          deviceName: device.deviceName,
          userId: device.userId,
          readingId: savedReading?.id,
          batteryLevel: reading.batteryLevel,
          outputWatts: reading.outputWatts,
          inputWatts: reading.inputWatts,
          status: reading.status,
          recordedAt: savedReading?.recorded_at
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
    const deleteResult = await executeQuery<{ count: string }>(
      `WITH deleted AS (
        DELETE FROM device_readings WHERE recorded_at < $1 RETURNING id
      ) SELECT count(*)::text as count FROM deleted`,
      [thirtyDaysAgo.toISOString()]
    )
    const cleanedUpCount = parseInt(deleteResult?.[0]?.count || '0', 10)

    if (cleanedUpCount > 0) {
      console.log(`🗑️ [CRON] Cleaned up ${cleanedUpCount} old readings (>30 days)`)
    }

    return NextResponse.json({
      message: 'Scheduled reading collection completed',
      timestamp: new Date().toISOString(),
      duration,
      summary: {
        totalDevices: devices.length,
        successful: successCount,
        failed: errorCount,
        cleanedUp: cleanedUpCount
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