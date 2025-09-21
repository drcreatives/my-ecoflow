import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET() {
  try {
    console.log('🔄 Testing Vercel Supabase connection...')
    
    // Test client-side connection
    const supabase = createClient()
    
    // Test basic connection
    const { data: healthCheck, error: healthError } = await supabase
      .from('users')
      .select('count(*)', { count: 'exact', head: true })
    
    if (healthError) {
      console.error('❌ Supabase health check failed:', healthError)
      return NextResponse.json({
        success: false,
        error: 'Supabase connection failed',
        details: healthError.message,
        instance: 'Vercel Supabase'
      }, { status: 500 })
    }

    // Test auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    console.log('✅ Vercel Supabase connection successful!')
    
    return NextResponse.json({
      success: true,
      message: 'Vercel Supabase connection working!',
      instance: 'vunlsiyowwivmloivtjf.supabase.co',
      healthCheck: healthCheck,
      auth: {
        user: user ? 'User session active' : 'No user session',
        error: authError?.message || null
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Test failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      instance: 'Vercel Supabase'
    }, { status: 500 })
  }
}