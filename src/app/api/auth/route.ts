import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { executeQuery, executeQuerySingle } from '@/lib/database'

// Helper function to ensure user exists in our database
async function ensureUserInDatabase(userId: string, email: string) {
  try {
    console.log('🔄 Ensuring user exists in database:', userId, email)
    
    // Check if user exists using direct PostgreSQL
    const existingUser = await executeQuerySingle<{
      id: string
      email: string
      password_hash: string
      created_at: Date
      updated_at: Date
    }>(`
      SELECT id, email, password_hash, created_at, updated_at
      FROM users 
      WHERE id = $1
    `, [userId])
    
    if (!existingUser) {
      // Create user if doesn't exist
      const dbUser = await executeQuerySingle<{
        id: string
        email: string
        password_hash: string
        created_at: Date
        updated_at: Date
      }>(`
        INSERT INTO users (id, email, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING id, email, password_hash, created_at, updated_at
      `, [userId, email, 'managed-by-supabase'])
      
      console.log('✅ Created user in database:', dbUser?.id)
      return dbUser
    } else {
      console.log('✅ User already exists in database:', existingUser.id)
      return existingUser
    }
  } catch (dbError) {
    console.error('❌ Database user creation error:', dbError)
    throw dbError
  }
}

export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json()
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
          await ensureUserInDatabase(data.user.id, data.user.email || email)
        } catch (dbError) {
          console.error('Failed to create user in database:', dbError)
          // Continue with signup even if database creation fails
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

      // Ensure user exists in our database (for users from old instance)
      if (data.user) {
        try {
          await ensureUserInDatabase(data.user.id, data.user.email || email)
        } catch (dbError) {
          console.error('Failed to create user in database, but login succeeded:', dbError)
          // Continue with login even if database creation fails
        }
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