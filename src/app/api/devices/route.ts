import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI, EcoFlowAPIError } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
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

    // Fetch devices from EcoFlow API
    const devices = await ecoflowAPI.getDeviceList()

    // Get user's registered devices from database
    const { data: userDevices, error: dbError } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', user.id)

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      )
    }

    // Merge EcoFlow API data with our database data
    const mergedDevices = devices.map(ecoDevice => {
      const userDevice = userDevices?.find(ud => ud.device_sn === ecoDevice.sn)
      return {
        id: userDevice?.id,
        deviceSn: ecoDevice.sn,
        deviceName: userDevice?.device_name || ecoDevice.productName,
        deviceType: ecoDevice.productType,
        isActive: userDevice?.is_active ?? ecoDevice.online === 1,
        online: ecoDevice.online === 1,
        status: ecoDevice.status,
        userId: user.id,
        createdAt: userDevice?.created_at,
        updatedAt: userDevice?.updated_at,
      }
    })

    return NextResponse.json({
      devices: mergedDevices,
      total: mergedDevices.length
    })

  } catch (error) {
    console.error('API Error:', error)
    
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

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { deviceSn, deviceName, deviceType } = body

    if (!deviceSn) {
      return NextResponse.json(
        { error: 'Device serial number is required' },
        { status: 400 }
      )
    }

    // Register device in our database
    const { data: device, error: dbError } = await supabase
      .from('devices')
      .insert({
        user_id: user.id,
        device_sn: deviceSn,
        device_name: deviceName,
        device_type: deviceType || 'DELTA_2',
        is_active: true,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to register device' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      device,
      message: 'Device registered successfully'
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}