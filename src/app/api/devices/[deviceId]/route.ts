import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI, EcoFlowAPIError } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { executeQuery } from '@/lib/database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    // Verify authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { deviceId } = await params

    // Get device from database
    const { data: device, error: dbError } = await supabase
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .eq('user_id', user.id)
      .single()

    if (dbError || !device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      )
    }

    // Get device quota/status from EcoFlow API
    try {
      const quotaData = await ecoflowAPI.getDeviceQuota(device.device_sn)
      
      return NextResponse.json({
        device: {
          id: device.id,
          deviceSn: device.device_sn,
          deviceName: device.device_name,
          deviceType: device.device_type,
          isActive: device.is_active,
          createdAt: device.created_at,
          updatedAt: device.updated_at,
        },
        quotaData
      })
    } catch (apiError) {
      console.error('EcoFlow API error:', apiError)
      
      // Return device info without quota data if API fails
      return NextResponse.json({
        device: {
          id: device.id,
          deviceSn: device.device_sn,
          deviceName: device.device_name,
          deviceType: device.device_type,
          isActive: device.is_active,
          createdAt: device.created_at,
          updatedAt: device.updated_at,
        },
        quotaData: null,
        error: 'Could not fetch real-time data'
      })
    }
  } catch (error) {
    console.error('Device details error:', error)
    
    if (error instanceof EcoFlowAPIError) {
      return NextResponse.json(
        { 
          error: 'EcoFlow API Error',
          message: error.message,
          code: error.code
        },
        { status: error.statusCode || 500 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { deviceId } = await params
    const body = await request.json()
    const { deviceName } = body

    if (!deviceName || typeof deviceName !== 'string') {
      return NextResponse.json({ error: 'Invalid device name' }, { status: 400 })
    }

    // Update device name using direct query
    const updatedDevice = await executeQuery(
      `UPDATE devices 
       SET device_name = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING 
         id,
         device_sn as "deviceSn",
         device_name as "deviceName",
         device_type as "deviceType",
         is_active as "isActive",
         user_id as "userId",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [deviceName, deviceId, user.id]
    )

    if (!updatedDevice || updatedDevice.length === 0) {
      return NextResponse.json({ error: 'Device not found or unauthorized' }, { status: 404 })
    }

    return NextResponse.json({ 
      message: 'Device updated successfully',
      device: updatedDevice[0]
    })
  } catch (error) {
    console.error('Error updating device:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { deviceId } = await params

    // First, delete related readings and alerts
    await executeQuery(
      'DELETE FROM device_readings WHERE device_id = $1',
      [deviceId]
    )

    await executeQuery(
      'DELETE FROM device_alerts WHERE device_id = $1',
      [deviceId]
    )

    // Then delete the device
    const deletedDevice = await executeQuery(
      `DELETE FROM devices 
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [deviceId, user.id]
    )

    if (!deletedDevice || deletedDevice.length === 0) {
      return NextResponse.json({ error: 'Device not found or unauthorized' }, { status: 404 })
    }

    return NextResponse.json({ 
      message: 'Device removed successfully'
    })
  } catch (error) {
    console.error('Error deleting device:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}