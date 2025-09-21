import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { prisma } from '@/lib/prisma'

/**
 * Background job endpoint to collect and store device readings
 * This can be called periodically by a cron job or monitoring system
 */
export async function POST(_request: NextRequest) {
  try {
    console.log('📊 Starting background reading collection...')
    
    // Verify authentication (could be a service account or API key)
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all devices for this user
    const devices = await prisma.device.findMany({
      where: {
        userId: user.id
      }
    })

    if (devices.length === 0) {
      console.log('ℹ️ No devices found for user')
      return NextResponse.json({ 
        message: 'No devices found',
        collected: 0 
      })
    }

    let successCount = 0
    let errorCount = 0
    const results = []

    // Collect readings for each device
    for (const device of devices) {
      try {
        console.log(`📡 Fetching reading for device: ${device.deviceSn}`)
        
        // Get current reading from EcoFlow API
        const quota = await ecoflowAPI.getDeviceQuota(device.deviceSn)
        if (!quota || !quota.quotaMap) {
          console.warn(`⚠️ No quota data for device: ${device.deviceSn}`)
          errorCount++
          continue
        }

        // Transform to reading format
        const reading = ecoflowAPI.transformQuotaToReading(quota, device.id)
        
        if (!reading) {
          console.warn(`⚠️ Could not transform quota data for device: ${device.deviceSn}`)
          errorCount++
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
            rawData: JSON.parse(JSON.stringify(reading.rawData || {}))
          }
        })

        console.log(`✅ Saved reading for ${device.deviceSn} - Battery: ${reading.batteryLevel}%`)
        
        results.push({
          deviceSn: device.deviceSn,
          deviceName: device.deviceName,
          readingId: savedReading.id,
          batteryLevel: reading.batteryLevel,
          outputWatts: reading.outputWatts,
          status: reading.status
        })
        
        successCount++
        
      } catch (error) {
        console.error(`❌ Error collecting reading for ${device.deviceSn}:`, error)
        errorCount++
        results.push({
          deviceSn: device.deviceSn,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`📊 Collection complete: ${successCount} success, ${errorCount} errors`)

    return NextResponse.json({
      message: 'Reading collection completed',
      timestamp: new Date().toISOString(),
      summary: {
        totalDevices: devices.length,
        successful: successCount,
        failed: errorCount
      },
      results
    })

  } catch (error) {
    console.error('❌ Error in reading collection:', error)
    
    // Handle Prisma connection errors
    if (error instanceof Error && error.message.includes('prepared statement')) {
      try {
        await prisma.$disconnect()
        console.log('Disconnected Prisma due to prepared statement error')
      } catch (disconnectError) {
        console.error('Error disconnecting Prisma:', disconnectError)
      }
    }
    
    return NextResponse.json({
      error: 'Failed to collect readings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}