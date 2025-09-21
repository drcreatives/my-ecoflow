import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  return POST()
}

export async function POST() {
  try {
    console.log('🔄 Testing manual user creation...')
    
    // Get current user from Supabase Auth
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    console.log('User from Supabase Auth:', {
      id: user.id,
      email: user.email,
      created_at: user.created_at
    })

    // Check if user exists in database
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id }
    })

    console.log('Existing user check result:', existingUser)

    if (existingUser) {
      return NextResponse.json({
        success: true,
        message: 'User already exists in database',
        user: existingUser
      })
    }

    // Try to create user
    console.log('Creating new user with data:', {
      id: user.id,
      email: user.email || 'no-email',
      passwordHash: 'managed-by-supabase'
    })

    const newUser = await prisma.user.create({
      data: {
        id: user.id,
        email: user.email || 'no-email',
        passwordHash: 'managed-by-supabase',
      }
    })

    console.log('✅ User created successfully:', newUser)

    return NextResponse.json({
      success: true,
      message: 'User created in database',
      user: newUser
    })

  } catch (error) {
    console.error('❌ Manual user creation failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to create user',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorType: error?.constructor?.name || 'Unknown'
    }, { status: 500 })
  }
}