import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const databaseUrl = process.env.DATABASE_URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    
    // Only show the hostname for security
    const dbHostname = databaseUrl ? new URL(databaseUrl.replace('postgresql://', 'http://')).hostname : 'not set'
    
    return NextResponse.json({
      status: 'success',
      environment: {
        databaseHostname: dbHostname,
        supabaseUrl: supabaseUrl,
        nodeEnv: process.env.NODE_ENV
      }
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Failed to check environment',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}