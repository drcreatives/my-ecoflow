import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { EcoFlowAPI } from '@/lib/ecoflow-api'

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const supabase = await createServerSupabaseClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please log in to discover devices' },
        { status: 401 }
      )
    }

    // Initialize EcoFlow API
    const api = new EcoFlowAPI({
      accessKey: process.env.ECOFLOW_ACCESS_KEY!,
      secretKey: process.env.ECOFLOW_SECRET_KEY!
    })

    // Get devices from EcoFlow API
    const devices = await api.getDeviceList()
    
    // Return discovered devices
    return NextResponse.json({
      success: true,
      devices: devices || [],
      message: `Found ${devices?.length || 0} device(s)`
    })

  } catch (error) {
    console.error('Device discovery error:', error)
    return NextResponse.json(
      { 
        error: 'Discovery Failed', 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    )
  }
}