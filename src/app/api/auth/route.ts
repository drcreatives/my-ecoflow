import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, action } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()

    if (action === 'signup') {
      // Sign up user with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        return NextResponse.json(
          { error: 'Signup failed', message: error.message },
          { status: 400 }
        )
      }

      // Create user record in our database
      if (data.user) {
        try {
          await prisma.$connect()
          const dbUser = await prisma.user.create({
            data: {
              id: data.user.id,
              email: data.user.email || email,
              passwordHash: 'managed-by-supabase', // Supabase handles password hashing
            }
          })
          console.log('Created user in database:', dbUser.id)
        } catch (dbError) {
          console.log('User might already exist in database:', dbError)
        } finally {
          await prisma.$disconnect()
        }
      }

      return NextResponse.json({
        success: true,
        message: 'User created successfully',
        user: {
          id: data.user?.id,
          email: data.user?.email,
        },
        session: data.session ? 'created' : 'confirmation_required'
      })

    } else if (action === 'login') {
      // Sign in user with Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return NextResponse.json(
          { error: 'Login failed', message: error.message },
          { status: 401 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Login successful',
        user: {
          id: data.user?.id,
          email: data.user?.email,
        },
        session: !!data.session
      })
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "signup" or "login"' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Auth API error:', error)
    return NextResponse.json(
      { 
        error: 'Authentication failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({
        success: false,
        message: 'No active session',
        authenticated: false
      })
    }

    return NextResponse.json({
      success: true,
      message: 'User is authenticated',
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
      }
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Session check failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}