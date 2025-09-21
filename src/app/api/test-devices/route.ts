import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    console.log('🔄 Testing devices endpoint functionality...')
    
    // Test 1: Authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required',
        details: 'User must be logged in to access devices',
        tests: {
          authentication: 'FAIL - No user session'
        }
      }, { status: 401 })
    }

    console.log('✅ User authenticated:', user.id)

    // Test 2: Database connection
    const userDevices = await prisma.device.findMany({
      where: { userId: user.id }
    })
    
    console.log(`✅ Found ${userDevices.length} devices for user`)

    // Test 3: EcoFlow API (basic check)
    let ecoflowStatus = 'UNKNOWN'
    try {
      // Just check if the API module loads
      const { ecoflowAPI } = await import('@/lib/ecoflow-api')
      ecoflowStatus = 'MODULE_LOADED'
    } catch (ecoError) {
      ecoflowStatus = 'MODULE_ERROR'
    }

    return NextResponse.json({
      success: true,
      message: 'Devices endpoint test successful',
      tests: {
        authentication: 'PASS',
        databaseQuery: 'PASS',
        ecoflowModule: ecoflowStatus
      },
      user: {
        id: user.id,
        email: user.email
      },
      userDevices: {
        count: userDevices.length,
        devices: userDevices.map(d => ({
          id: d.id,
          deviceSn: d.deviceSn,
          deviceName: d.deviceName,
          isActive: d.isActive
        }))
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Devices test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Devices endpoint test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorType: error?.constructor?.name || 'Unknown'
    }, { status: 500 })
  }
}