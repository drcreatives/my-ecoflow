import { NextRequest, NextResponse } from 'next/server'
import { validateEnvironmentVariables } from '@/lib/env-validation'

export async function GET(request: NextRequest) {
  try {
    const { isValid, missingVars, warnings } = validateEnvironmentVariables()
    
    // Create a safe summary (don't expose actual values)
    const envStatus = {
      ecoflowApi: {
        accessKey: !!process.env.ECOFLOW_ACCESS_KEY && !process.env.ECOFLOW_ACCESS_KEY.includes('your_'),
        secretKey: !!process.env.ECOFLOW_SECRET_KEY && !process.env.ECOFLOW_SECRET_KEY.includes('your_'),
      },
      supabase: {
        url: !!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.includes('supabase.co'),
        anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 100,
      },
      database: {
        url: !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('[YOUR-PASSWORD]'),
      },
      nextAuth: {
        secret: !!process.env.NEXTAUTH_SECRET && !process.env.NEXTAUTH_SECRET.includes('generate_a_random'),
        url: !!process.env.NEXTAUTH_URL,
      }
    }
    
    return NextResponse.json({
      success: true,
      isValid,
      status: envStatus,
      missingVars,
      warnings,
      message: isValid ? 'All required environment variables are configured' : 'Some environment variables need attention',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Environment validation error:', error)
    
    return NextResponse.json(
      { 
        error: 'Environment validation failed',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      },
      { status: 500 }
    )
  }
}