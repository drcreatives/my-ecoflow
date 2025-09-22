import { NextResponse } from 'next/server'
import { executeQuery } from '@/lib/database'

export async function POST() {
  try {
    // Check if notification_settings table already exists
    const tableExists = await executeQuery<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'notification_settings'
      )`,
      []
    )

    if (tableExists[0]?.exists) {
      return NextResponse.json({ 
        message: 'notification_settings table already exists' 
      })
    }

    // Create notification_settings table
    await executeQuery(
      `CREATE TABLE notification_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        device_alerts BOOLEAN DEFAULT true,
        low_battery BOOLEAN DEFAULT true,
        power_threshold BOOLEAN DEFAULT true,
        system_updates BOOLEAN DEFAULT true,
        weekly_reports BOOLEAN DEFAULT false,
        email_notifications BOOLEAN DEFAULT true,
        push_notifications BOOLEAN DEFAULT false,
        low_battery_threshold INTEGER DEFAULT 20,
        power_threshold_watts INTEGER DEFAULT 100,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id)
      )`,
      []
    )

    // Create index for faster lookups
    await executeQuery(
      `CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id 
       ON notification_settings(user_id)`,
      []
    )

    return NextResponse.json({ 
      message: 'Successfully created notification_settings table' 
    })
  } catch (error) {
    console.error('Error creating notification_settings table:', error)
    return NextResponse.json(
      { error: 'Failed to create notification_settings table', details: error }, 
      { status: 500 }
    )
  }
}