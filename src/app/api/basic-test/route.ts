import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    // Most basic test - just return environment info
    return NextResponse.json({
      success: true,
      message: 'Basic production test successful',
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseUrlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30),
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 30),
        hasEcoflowKey: !!process.env.ECOFLOW_ACCESS_KEY
      },
      timestamp: new Date().toISOString(),
      vercel: {
        region: process.env.VERCEL_REGION || 'unknown',
        env: process.env.VERCEL_ENV || 'unknown'
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Basic test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}