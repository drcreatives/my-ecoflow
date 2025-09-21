import { NextRequest, NextResponse } from 'next/server'

/**
 * Test endpoint for the cron job functionality
 * Use this to verify that the cron endpoint works before deploying
 */
export async function GET(request: NextRequest) {
  try {
    // Test the cron endpoint with the secret
    const cronSecret = process.env.CRON_SECRET
    
    if (!cronSecret) {
      return NextResponse.json({
        error: 'CRON_SECRET not configured',
        message: 'Please add CRON_SECRET to your environment variables'
      }, { status: 500 })
    }

    // Make a request to our cron endpoint
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    
    console.log(`🧪 Testing cron endpoint: ${baseUrl}/api/cron/collect-readings`)
    
    const response = await fetch(`${baseUrl}/api/cron/collect-readings`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    return NextResponse.json({
      message: 'Cron job test completed',
      timestamp: new Date().toISOString(),
      cronEndpointStatus: response.status,
      cronResponse: data,
      environment: {
        vercelUrl: process.env.VERCEL_URL || 'localhost',
        nodeEnv: process.env.NODE_ENV,
        hasCronSecret: !!cronSecret
      }
    })

  } catch (error) {
    console.error('❌ Error testing cron job:', error)
    return NextResponse.json({
      error: 'Cron job test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}