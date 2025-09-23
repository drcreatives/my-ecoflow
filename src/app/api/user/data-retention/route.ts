import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';
import { createServerSupabaseClient } from '@/lib/supabase-server';

interface DataRetentionSettings {
  user_id: string;
  retention_period_days: number;
  auto_cleanup_enabled: boolean;
  backup_enabled: boolean;
  collection_interval_minutes: number;
  last_cleanup: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's data retention settings
    const settings = await executeQuery(
      `SELECT * FROM data_retention_settings WHERE user_id = $1`,
      [user.id]
    ) as DataRetentionSettings[];

    if (settings.length === 0) {
      // Create default settings if none exist
      const defaultSettings = {
        user_id: user.id,
        retention_period_days: 90, // Default 3 months
        auto_cleanup_enabled: true,
        backup_enabled: true,
        collection_interval_minutes: 5 // Default 5 minutes
      };

      await executeQuery(
        `INSERT INTO data_retention_settings (user_id, retention_period_days, auto_cleanup_enabled, backup_enabled, collection_interval_minutes)
         VALUES ($1, $2, $3, $4, $5)`,
        [defaultSettings.user_id, defaultSettings.retention_period_days, defaultSettings.auto_cleanup_enabled, defaultSettings.backup_enabled, defaultSettings.collection_interval_minutes]
      );

      return NextResponse.json({
        success: true,
        settings: defaultSettings
      });
    }

    return NextResponse.json({
      success: true,
      settings: settings[0]
    });

  } catch (error) {
    console.error('Data retention settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { retentionPeriodDays, autoCleanupEnabled, backupEnabled, collectionIntervalMinutes } = body;

    // Validate inputs
    if (typeof retentionPeriodDays !== 'number' || retentionPeriodDays < 1 || retentionPeriodDays > 365) {
      return NextResponse.json(
        { error: 'Retention period must be between 1 and 365 days' },
        { status: 400 }
      );
    }

    if (collectionIntervalMinutes !== undefined && (typeof collectionIntervalMinutes !== 'number' || collectionIntervalMinutes < 1 || collectionIntervalMinutes > 1440)) {
      return NextResponse.json(
        { error: 'Collection interval must be between 1 and 1440 minutes (24 hours)' },
        { status: 400 }
      );
    }

    // Update settings
    await executeQuery(
      `INSERT INTO data_retention_settings (user_id, retention_period_days, auto_cleanup_enabled, backup_enabled, collection_interval_minutes, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         retention_period_days = $2,
         auto_cleanup_enabled = $3,
         backup_enabled = $4,
         collection_interval_minutes = COALESCE($5, data_retention_settings.collection_interval_minutes),
         updated_at = NOW()`,
      [user.id, retentionPeriodDays, autoCleanupEnabled, backupEnabled, collectionIntervalMinutes || 5]
    );

    // Get updated settings
    const updatedSettings = await executeQuery(
      `SELECT * FROM data_retention_settings WHERE user_id = $1`,
      [user.id]
    ) as DataRetentionSettings[];

    return NextResponse.json({
      success: true,
      settings: updatedSettings[0],
      message: 'Data retention settings updated successfully'
    });

  } catch (error) {
    console.error('Data retention settings update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}