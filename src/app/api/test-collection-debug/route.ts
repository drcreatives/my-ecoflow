import { NextRequest, NextResponse } from 'next/server'
import { executeQuery } from '@/lib/database'
import { EcoFlowAPI } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [TEST] Testing collection transformation and insertion...')
    
    // Get user from auth
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's devices
    const devices = await executeQuery(
      'SELECT id, device_sn as "deviceSn", device_name as "deviceName" FROM devices WHERE user_id = $1',
      [user.id]
    )

    if (!devices || devices.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No devices found for user'
      })
    }

    // Initialize API and fetch quota data
    const api = new EcoFlowAPI({
      accessKey: process.env.ECOFLOW_ACCESS_KEY!,
      secretKey: process.env.ECOFLOW_SECRET_KEY!
    })

    const quotaResponse = await api.getDeviceQuota(devices[0].deviceSn)
    
    if (!quotaResponse) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch quota data'
      })
    }

    // Transform quota to reading
    const transformedReading = api.transformQuotaToReading(quotaResponse, devices[0].id)
    
    if (!transformedReading) {
      return NextResponse.json({
        success: false,
        error: 'Failed to transform quota data'
      })
    }

    console.log('📊 Transformed reading structure:', {
      deviceId: transformedReading.deviceId,
      acOutputWatts: transformedReading.acOutputWatts,
      dcOutputWatts: transformedReading.dcOutputWatts,
      usbOutputWatts: transformedReading.usbOutputWatts,
      outputWatts: transformedReading.outputWatts,
      inputWatts: transformedReading.inputWatts,
      batteryLevel: transformedReading.batteryLevel
    })

    // Test the actual database insertion query
    const insertResult = await executeQuery(
      `INSERT INTO device_readings (
        device_id, battery_level, input_watts, output_watts, 
        ac_output_watts, dc_output_watts, usb_output_watts,
        temperature, status, raw_data, recorded_at
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING id, ac_output_watts, dc_output_watts, usb_output_watts`,
      [
        transformedReading.deviceId,
        transformedReading.batteryLevel,
        transformedReading.inputWatts,
        transformedReading.outputWatts,
        transformedReading.acOutputWatts,
        transformedReading.dcOutputWatts,
        transformedReading.usbOutputWatts,
        transformedReading.temperature,
        transformedReading.status,
        JSON.stringify(transformedReading.rawData),
        transformedReading.recordedAt
      ]
    )

    // Now fetch the reading back to verify it was stored correctly
    const verifyQuery = await executeQuery(
      `SELECT id, ac_output_watts, dc_output_watts, usb_output_watts, output_watts, input_watts, battery_level 
       FROM device_readings 
       WHERE id = $1`,
      [insertResult[0].id]
    )

    return NextResponse.json({
      success: true,
      message: 'Collection debug test completed',
      debug: {
        transformedReading: {
          acOutputWatts: transformedReading.acOutputWatts,
          dcOutputWatts: transformedReading.dcOutputWatts,
          usbOutputWatts: transformedReading.usbOutputWatts,
          outputWatts: transformedReading.outputWatts,
        },
        insertResult: insertResult[0],
        verifyResult: verifyQuery[0],
        rawQuotaFields: {
          'inv.outputWatts': quotaResponse.quotaMap['inv.outputWatts']?.val,
          'pd.carWatts': quotaResponse.quotaMap['pd.carWatts']?.val,
          'pd.typec1Watts': quotaResponse.quotaMap['pd.typec1Watts']?.val,
          'pd.usb1Watts': quotaResponse.quotaMap['pd.usb1Watts']?.val,
          'pd.wattsOutSum': quotaResponse.quotaMap['pd.wattsOutSum']?.val
        }
      }
    })

  } catch (error: any) {
    console.error('❌ Collection debug test failed:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}