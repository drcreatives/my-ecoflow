import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🔄 Production diagnostic check starting...')
    
    // Test 1: Environment Variables Check
    const envCheck = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasEcoflowKeys: !!(process.env.ECOFLOW_ACCESS_KEY && process.env.ECOFLOW_SECRET_KEY),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 50) + '...',
      databaseHost: process.env.DATABASE_URL?.includes('vunlsiyowwivmloivtjf') ? 'NEW_INSTANCE' : 'OLD_OR_UNKNOWN'
    }

    // Test 2: Import Tests
    const importTests: { [key: string]: string } = {
      supabase: 'UNKNOWN',
      prisma: 'UNKNOWN',
      ecoflow: 'UNKNOWN'
    }

    try {
      await import('@/lib/supabase')
      importTests.supabase = 'SUCCESS'
    } catch (e) {
      importTests.supabase = `ERROR: ${e instanceof Error ? e.message : 'Unknown'}`
    }

    try {
      await import('@/lib/prisma')
      importTests.prisma = 'SUCCESS'
    } catch (e) {
      importTests.prisma = `ERROR: ${e instanceof Error ? e.message : 'Unknown'}`
    }

    try {
      await import('@/lib/ecoflow-api')
      importTests.ecoflow = 'SUCCESS'
    } catch (e) {
      importTests.ecoflow = `ERROR: ${e instanceof Error ? e.message : 'Unknown'}`
    }

    // Test 3: Basic Supabase Client Creation
    let supabaseTest = 'UNKNOWN'
    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      supabaseTest = 'CLIENT_CREATED'
    } catch (e) {
      supabaseTest = `ERROR: ${e instanceof Error ? e.message : 'Unknown'}`
    }

    // Test 4: Prisma Connection Test
    let prismaTest = 'UNKNOWN'
    try {
      const { prisma } = await import('@/lib/prisma')
      // Don't actually connect in production diagnostic, just check if it loads
      prismaTest = 'MODULE_LOADED'
    } catch (e) {
      prismaTest = `ERROR: ${e instanceof Error ? e.message : 'Unknown'}`
    }

    return NextResponse.json({
      success: true,
      message: 'Production diagnostic completed',
      environment: process.env.NODE_ENV,
      platform: 'vercel',
      timestamp: new Date().toISOString(),
      tests: {
        environmentVariables: envCheck,
        moduleImports: importTests,
        supabaseClient: supabaseTest,
        prismaModule: prismaTest
      },
      recommendations: [
        envCheck.hasSupabaseUrl ? '✅ Supabase URL found' : '❌ Missing NEXT_PUBLIC_SUPABASE_URL',
        envCheck.hasSupabaseKey ? '✅ Supabase Key found' : '❌ Missing NEXT_PUBLIC_SUPABASE_ANON_KEY',
        envCheck.hasDatabaseUrl ? '✅ Database URL found' : '❌ Missing DATABASE_URL',
        envCheck.hasEcoflowKeys ? '✅ EcoFlow keys found' : '❌ Missing EcoFlow API keys',
        envCheck.databaseHost === 'NEW_INSTANCE' ? '✅ Using new Supabase instance' : '⚠️ Check database URL'
      ]
    })

  } catch (error) {
    console.error('❌ Production diagnostic failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Production diagnostic failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}