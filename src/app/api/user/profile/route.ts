import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { executeQuery } from '@/lib/database'

interface UserProfile {
  id: string
  email: string
  firstName?: string
  lastName?: string
  createdAt: string
  updatedAt?: string
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile from database
    const profile = await executeQuery<UserProfile[]>(
      `SELECT 
        id, 
        email, 
        first_name as "firstName", 
        last_name as "lastName", 
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users 
      WHERE id = $1`,
      [user.id]
    )

    if (profile.length === 0) {
      // Create user profile if it doesn't exist
      const newProfile = await executeQuery<UserProfile[]>(
        `INSERT INTO users (id, email, created_at) 
         VALUES ($1, $2, NOW()) 
         RETURNING id, email, first_name as "firstName", last_name as "lastName", created_at as "createdAt"`,
        [user.id, user.email]
      )
      
      return NextResponse.json({ profile: newProfile[0] })
    }

    return NextResponse.json({ profile: profile[0] })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user profile' }, 
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName } = body

    // Validate input
    if (firstName && (typeof firstName !== 'string' || firstName.length > 50)) {
      return NextResponse.json(
        { error: 'First name must be a string and less than 50 characters' }, 
        { status: 400 }
      )
    }

    if (lastName && (typeof lastName !== 'string' || lastName.length > 50)) {
      return NextResponse.json(
        { error: 'Last name must be a string and less than 50 characters' }, 
        { status: 400 }
      )
    }

    // Update user profile
    const updatedProfile = await executeQuery<UserProfile[]>(
      `UPDATE users 
       SET first_name = $2, last_name = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, first_name as "firstName", last_name as "lastName", created_at as "createdAt", updated_at as "updatedAt"`,
      [user.id, firstName || null, lastName || null]
    )

    if (updatedProfile.length === 0) {
      return NextResponse.json(
        { error: 'User profile not found' }, 
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      profile: updatedProfile[0],
      message: 'Profile updated successfully' 
    })
  } catch (error) {
    console.error('Error updating user profile:', error)
    return NextResponse.json(
      { error: 'Failed to update user profile' }, 
      { status: 500 }
    )
  }
}