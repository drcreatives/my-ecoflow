import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI, EcoFlowAPIError } from '@/lib/ecoflow-api'

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching devices from EcoFlow API...')
    
    // Fetch devices from EcoFlow API (no authentication required for testing)
    const devices = await ecoflowAPI.getDeviceList()
    console.log('EcoFlow devices found:', devices.length)

    // Transform devices to our expected format
    const transformedDevices = devices.map(ecoDevice => ({
      id: `temp-${ecoDevice.sn}`, // Temporary ID for testing
      deviceSn: ecoDevice.sn,
      deviceName: ecoDevice.productName,
      deviceType: ecoDevice.productType,
      isActive: ecoDevice.online === 1,
      online: ecoDevice.online === 1,
      status: ecoDevice.status,
      userId: null, // No user ID in test mode
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))

    return NextResponse.json({
      success: true,
      data: transformedDevices,
      message: 'Devices fetched successfully (test mode)',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('EcoFlow API error:', error)
    
    if (error instanceof EcoFlowAPIError) {
      return NextResponse.json(
        { 
          error: 'EcoFlow API Error',
          message: error.message,
          code: error.code,
          statusCode: error.statusCode
        },
        { status: error.statusCode || 500 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Unknown error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'POST method not implemented in test mode' },
    { status: 501 }
  )
}