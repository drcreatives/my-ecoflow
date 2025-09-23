import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';

export async function POST() {
  try {
    // Create password_change_log table for security tracking
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS password_change_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for faster queries
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_password_change_log_user_id 
      ON password_change_log(user_id)
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_password_change_log_changed_at 
      ON password_change_log(changed_at)
    `);

    return NextResponse.json({
      success: true,
      message: 'Password change log table created successfully'
    });

  } catch (error) {
    console.error('Password change log migration error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create password change log table',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}