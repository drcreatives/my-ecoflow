import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { executeQuery } from '@/lib/database'

/**
 * Background job endpoint to collect and store device readings
 * This can be called periodically by a cron job or monitoring system
 * Now respects user's collection interval preferences
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📊 Starting background reading collection...')
    
    // Check if this is a user-specific collection or global collection
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const forceCollection = url.searchParams.get('force') === 'true';
    
    let targetUsers: string[] = [];
    
    if (userId) {
      // Specific user collection
      targetUsers = [userId];
    } else {
      // Global collection - get all users with their collection intervals
      const allUsers = await executeQuery<{
        user_id: string;
        collection_interval_minutes: number;
        last_collection: string | null;
      }>(`
        SELECT 
          drs.user_id,
          drs.collection_interval_minutes,
          MAX(dr.recorded_at) as last_collection
        FROM data_retention_settings drs
        LEFT JOIN devices d ON d.user_id = drs.user_id
        LEFT JOIN device_readings dr ON dr.device_id = d.id
        GROUP BY drs.user_id, drs.collection_interval_minutes
      `);

      // Filter users who need collection based on their interval
      const now = new Date();
      targetUsers = allUsers.filter(user => {
        if (forceCollection) return true;
        
        if (!user.last_collection) return true; // No previous collection
        
        const lastCollection = new Date(user.last_collection);
        const intervalMs = user.collection_interval_minutes * 60 * 1000;
        const timeSinceLastCollection = now.getTime() - lastCollection.getTime();
        
        return timeSinceLastCollection >= intervalMs;
      }).map(user => user.user_id);

      console.log(`📈 Found ${targetUsers.length} users needing collection out of ${allUsers.length} total users`);
    }

    if (targetUsers.length === 0) {
      return NextResponse.json({
        message: 'No users need collection at this time',
        collected: 0,
        skipped: 'All users are within their collection interval'
      });
    }
    let totalSuccessCount = 0;
    let totalErrorCount = 0;
    const allResults = [];

    // Process each user
    for (const currentUserId of targetUsers) {
      console.log(`👤 Processing user: ${currentUserId}`);
      
      // Get all devices for this user using direct PostgreSQL
      const devices = await executeQuery<{
        id: string
        deviceSn: string
        deviceName: string
        userId: string
      }>(`
        SELECT id, device_sn as "deviceSn", device_name as "deviceName", user_id as "userId"
        FROM devices
        WHERE user_id = $1
      `, [currentUserId])

      if (devices.length === 0) {
        console.log(`ℹ️ No devices found for user ${currentUserId}`)
        continue;
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
        
        // DEBUG: Log the transformed reading values
        console.log(`🔍 [DEBUG] Transformed reading for ${device.deviceSn}:`, {
          acOutputWatts: reading.acOutputWatts,
          dcOutputWatts: reading.dcOutputWatts,
          usbOutputWatts: reading.usbOutputWatts,
          outputWatts: reading.outputWatts,
          batteryLevel: reading.batteryLevel
        })
        
        // Save to database using direct PostgreSQL
        const savedReading = await executeQuery<{
          id: string
        }>(`
          INSERT INTO device_readings (
            id,
            device_id, 
            battery_level, 
            input_watts, 
            output_watts,
            ac_output_watts,
            dc_output_watts,
            usb_output_watts,
            remaining_time, 
            temperature, 
            status, 
            raw_data,
            recorded_at
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            NOW()
          )
          RETURNING id
        `, [
          device.id,
          reading.batteryLevel || 0,
          reading.inputWatts || 0,
          reading.outputWatts || 0,
          reading.acOutputWatts || 0,
          reading.dcOutputWatts || 0,
          reading.usbOutputWatts || 0,
          reading.remainingTime,
          reading.temperature || 0,
          reading.status || 'unknown',
          JSON.stringify(reading.rawData || {})
        ])

        console.log(`✅ Saved reading for ${device.deviceSn} - Battery: ${reading.batteryLevel}%`)
        console.log(`🔍 [DEBUG] Inserted values: AC:${reading.acOutputWatts}, DC:${reading.dcOutputWatts}, USB:${reading.usbOutputWatts}`)
        
        results.push({
          deviceSn: device.deviceSn,
          deviceName: device.deviceName,
          readingId: savedReading[0].id,
          batteryLevel: reading.batteryLevel,
          outputWatts: reading.outputWatts,
          acOutputWatts: reading.acOutputWatts,
          dcOutputWatts: reading.dcOutputWatts,
          usbOutputWatts: reading.usbOutputWatts,
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

    console.log(`📊 User ${currentUserId} collection complete: ${successCount} success, ${errorCount} errors`)

    totalSuccessCount += successCount;
    totalErrorCount += errorCount;
    
    allResults.push({
      userId: currentUserId,
      deviceCount: devices.length,
      successful: successCount,
      failed: errorCount,
      results
    });
  }

  const result = {
    message: 'Reading collection completed',
    timestamp: new Date().toISOString(),
    summary: {
      totalUsers: targetUsers.length,
      totalSuccessful: totalSuccessCount,
      totalFailed: totalErrorCount
    },
    userResults: allResults
  }

  return NextResponse.json(result)

  } catch (error) {
    console.error('❌ Error in reading collection:', error)
    
    return NextResponse.json({
      error: 'Failed to collect readings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}