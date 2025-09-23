import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';

export async function POST() {
  try {
    // Create session_settings table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS session_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL UNIQUE,
        session_timeout_minutes INTEGER NOT NULL DEFAULT 30,
        auto_logout_enabled BOOLEAN DEFAULT true,
        remember_me_duration_days INTEGER DEFAULT 30,
        force_logout_on_new_device BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create session_activity table for tracking active sessions
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS session_activity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expired_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Create indexes for faster queries
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_session_settings_user_id 
      ON session_settings(user_id)
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_session_activity_user_id 
      ON session_activity(user_id)
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_session_activity_session_id 
      ON session_activity(session_id)
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_session_activity_last_activity 
      ON session_activity(last_activity)
    `);

    return NextResponse.json({
      success: true,
      message: 'Session management tables created successfully'
    });

  } catch (error) {
    console.error('Session management migration error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create session management tables',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}