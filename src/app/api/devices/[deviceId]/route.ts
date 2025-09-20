import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI, EcoFlowAPIError } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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