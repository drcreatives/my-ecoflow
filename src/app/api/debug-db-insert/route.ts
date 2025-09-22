import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { executeQuery } from '@/lib/database'

/**
 * Debug endpoint to test actual database insertion of AC/DC/USB values
 */
export async function POST(_request: NextRequest) {
  try {
    console.log('🔍 [DEBUG] Testing database insertion of AC/DC/USB values...')
    
    // Get real data from EcoFlow API
    const deviceSN = 'R331ZKB5SG7V0293'
    const quota = await ecoflowAPI.getDeviceQuota(deviceSN)
    
    if (!quota || !quota.quotaMap) {
      return NextResponse.json({ error: 'No quota data found' })
    }

    // Transform to reading format
    const reading = ecoflowAPI.transformQuotaToReading(quota,       'debug-test-device',)
    
    if (!reading) {
      return NextResponse.json({ error: 'Failed to transform reading' })
    }

    console.log('🔍 [DEBUG] Pre-insertion values:', {
      acOutputWatts: reading.acOutputWatts,
      dcOutputWatts: reading.dcOutputWatts,
      usbOutputWatts: reading.usbOutputWatts,
      outputWatts: reading.outputWatts,
    })

    // Insert into database with debug logging
    const insertResult = await executeQuery<{ id: string }>(`
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
      )
      RETURNING id, ac_output_watts, dc_output_watts, usb_output_watts
    `, [
      '98b4546c-ceca-45d7-9c75-6088c875ed21',
      reading.batteryLevel || 0,
      reading.inputWatts || 0,
      reading.outputWatts || 0,
      reading.acOutputWatts || 0,    // $5
      reading.dcOutputWatts || 0,    // $6
      reading.usbOutputWatts || 0,   // $7
      reading.remainingTime,
      reading.temperature || 0,
      reading.status || 'unknown',
      JSON.stringify(reading.rawData || {})
    ])

    console.log('🔍 [DEBUG] Insertion result:', insertResult)

    // Immediately query back to see what was stored
    const retrievedReading = await executeQuery<{
      id: string
      ac_output_watts: number | null
      dc_output_watts: number | null
      usb_output_watts: number | null
    }>(`
      SELECT id, ac_output_watts, dc_output_watts, usb_output_watts 
      FROM device_readings 
      WHERE id = $1
    `, [insertResult[0].id])

    console.log('🔍 [DEBUG] Retrieved from DB:', retrievedReading)

    return NextResponse.json({
      success: true,
      data: {
        originalValues: {
          acOutputWatts: reading.acOutputWatts,
          dcOutputWatts: reading.dcOutputWatts,
          usbOutputWatts: reading.usbOutputWatts,
        },
        insertedId: insertResult[0].id,
        retrievedValues: {
          acOutputWatts: retrievedReading[0].ac_output_watts,
          dcOutputWatts: retrievedReading[0].dc_output_watts,
          usbOutputWatts: retrievedReading[0].usb_output_watts,
        }
      }
    })

  } catch (error) {
    console.error('❌ Error in database insertion test:', error)
    
    return NextResponse.json({
      error: 'Failed to test database insertion',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}