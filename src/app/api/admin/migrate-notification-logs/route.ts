import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    // Create notification_logs table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        message_id VARCHAR(255),
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create index for better query performance
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id 
      ON notification_logs(user_id)
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at 
      ON notification_logs(sent_at)
    `);

    return NextResponse.json({
      success: true,
      message: 'Notification logs table created successfully'
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { 
        error: 'Migration failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}