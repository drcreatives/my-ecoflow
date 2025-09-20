import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI, EcoFlowAPIError } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(
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

    // Parse command from request body
    const body = await request.json()
    const { command } = body

    if (!command) {
      return NextResponse.json(
        { error: 'Command is required' },
        { status: 400 }
      )
    }

    // Send command to EcoFlow API
    try {
      const result = await ecoflowAPI.setDeviceFunction(
        device.device_sn,
        command
      )

      // Log the command for audit purposes
      await supabase
        .from('device_commands')
        .insert({
          device_id: deviceId,
          user_id: user.id,
          command_type: `${command.cmdSet}_${command.cmdId}`,
          command_data: command,
          result_data: result,
          executed_at: new Date().toISOString()
        })

      return NextResponse.json({
        success: true,
        message: 'Command sent successfully',
        device: {
          id: device.id,
          deviceSn: device.device_sn,
          deviceName: device.device_name,
        },
        command,
        result
      })

    } catch (apiError) {
      console.error('EcoFlow API command error:', apiError)
      
      return NextResponse.json(
        { 
          error: 'Failed to send command',
          message: apiError instanceof Error ? apiError.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Device control error:', error)
    
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