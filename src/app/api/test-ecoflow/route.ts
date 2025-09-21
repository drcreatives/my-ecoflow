import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI, EcoFlowAPIError } from '@/lib/ecoflow-api'

export async function GET(_request: NextRequest) {
  try {
    // Test EcoFlow API connection without authentication
    console.log('🔍 Testing EcoFlow API connection...')
    console.log('Access Key:', process.env.ECOFLOW_ACCESS_KEY?.substring(0, 8) + '...')
    console.log('Secret Key:', process.env.ECOFLOW_SECRET_KEY?.substring(0, 8) + '...')
    
    // Try to get device list to test the API connection
    console.log('📡 Attempting to fetch device list...')
    const devices = await ecoflowAPI.getDeviceList()
    console.log('✅ EcoFlow devices found:', devices.length)
    console.log('📋 Device details:', devices)
    
    return NextResponse.json({
      success: true,
      message: 'EcoFlow API connection successful',
      deviceCount: devices.length,
      devices: devices, // Return all devices for debugging
      credentials: {
        accessKeyPrefix: process.env.ECOFLOW_ACCESS_KEY?.substring(0, 8) + '...',
        secretKeyPrefix: process.env.ECOFLOW_SECRET_KEY?.substring(0, 8) + '...',
        hasAccessKey: !!process.env.ECOFLOW_ACCESS_KEY,
        hasSecretKey: !!process.env.ECOFLOW_SECRET_KEY,
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ EcoFlow API test failed:', error)
    
    // Enhanced error logging
    if (error instanceof EcoFlowAPIError) {
      console.error('EcoFlow API Error Details:', {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        response: error.response
      })
      
      return NextResponse.json(
        { 
          error: 'EcoFlow API Error',
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
          response: error.response,
          debug: {
            accessKeyExists: !!process.env.ECOFLOW_ACCESS_KEY,
            secretKeyExists: !!process.env.ECOFLOW_SECRET_KEY,
            accessKeyPrefix: process.env.ECOFLOW_ACCESS_KEY?.substring(0, 8) + '...',
          }
        },
        { status: error.statusCode || 500 }
      )
    }

    // Handle other types of errors
    console.error('Unknown error type:', error)
    return NextResponse.json(
      { 
        error: 'Unknown error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        debug: {
          errorType: error?.constructor?.name,
          stack: error instanceof Error ? error.stack : undefined
        }
      },
      { status: 500 }
    )
  }
}