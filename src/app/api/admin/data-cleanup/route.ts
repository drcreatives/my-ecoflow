import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    // Verify this is a cron job or admin request
    const authHeader = request.headers.get('authorization');
    const cronSecret = request.headers.get('x-cron-secret');
    
    if (cronSecret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all users with auto cleanup enabled
    const usersWithCleanup = await executeQuery(`
      SELECT 
        drs.user_id,
        drs.retention_period_days,
        drs.auto_cleanup_enabled,
        drs.last_cleanup
      FROM data_retention_settings drs
      WHERE drs.auto_cleanup_enabled = true
    `) as Array<{
      user_id: string;
      retention_period_days: number;
      auto_cleanup_enabled: boolean;
      last_cleanup: string | null;
    }>;

    let totalCleaned = 0;
    const cleanupResults = [];

    for (const userSettings of usersWithCleanup) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - userSettings.retention_period_days);

      // Clean up old device readings
      const readingsResult = await executeQuery(
        `DELETE FROM device_readings 
         WHERE recorded_at < $1 
         AND device_id IN (
           SELECT id FROM devices WHERE user_id = $2
         )`,
        [cutoffDate.toISOString(), userSettings.user_id]
      );

      // Clean up old notification logs
      const notificationResult = await executeQuery(
        `DELETE FROM notification_logs 
         WHERE created_at < $1 
         AND user_id = $2`,
        [cutoffDate.toISOString(), userSettings.user_id]
      );

      // Clean up old alerts
      const alertsResult = await executeQuery(
        `DELETE FROM alerts 
         WHERE created_at < $1 
         AND device_id IN (
           SELECT id FROM devices WHERE user_id = $2
         )`,
        [cutoffDate.toISOString(), userSettings.user_id]
      );

      // Update last cleanup time
      await executeQuery(
        `UPDATE data_retention_settings 
         SET last_cleanup = NOW() 
         WHERE user_id = $1`,
        [userSettings.user_id]
      );

      const userCleaned = (readingsResult as any).rowCount || 0;
      totalCleaned += userCleaned;

      cleanupResults.push({
        userId: userSettings.user_id,
        retentionDays: userSettings.retention_period_days,
        readingsDeleted: (readingsResult as any).rowCount || 0,
        notificationsDeleted: (notificationResult as any).rowCount || 0,
        alertsDeleted: (alertsResult as any).rowCount || 0,
        cutoffDate: cutoffDate.toISOString()
      });
    }

    return NextResponse.json({
      success: true,
      message: `Data cleanup completed. ${totalCleaned} records cleaned.`,
      usersProcessed: usersWithCleanup.length,
      totalRecordsCleaned: totalCleaned,
      cleanupResults
    });

  } catch (error) {
    console.error('Data cleanup error:', error);
    return NextResponse.json(
      { 
        error: 'Data cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint for manual cleanup (admin only)
export async function GET(request: NextRequest) {
  try {
    const supabase = await (await import('@/lib/supabase-server')).createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's retention settings
    const userSettings = await executeQuery(
      `SELECT retention_period_days FROM data_retention_settings WHERE user_id = $1`,
      [user.id]
    ) as Array<{ retention_period_days: number }>;

    if (userSettings.length === 0) {
      return NextResponse.json(
        { error: 'No retention settings found. Please configure data retention first.' },
        { status: 400 }
      );
    }

    const retentionDays = userSettings[0].retention_period_days;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Preview what would be deleted (don't actually delete)
    const readingsCount = await executeQuery(
      `SELECT COUNT(*) as count FROM device_readings 
       WHERE recorded_at < $1 
       AND device_id IN (
         SELECT id FROM devices WHERE user_id = $2
       )`,
      [cutoffDate.toISOString(), user.id]
    ) as Array<{ count: string }>;

    const notificationsCount = await executeQuery(
      `SELECT COUNT(*) as count FROM notification_logs 
       WHERE created_at < $1 
       AND user_id = $2`,
      [cutoffDate.toISOString(), user.id]
    ) as Array<{ count: string }>;

    return NextResponse.json({
      success: true,
      preview: true,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      recordsToDelete: {
        deviceReadings: parseInt(readingsCount[0]?.count || '0'),
        notificationLogs: parseInt(notificationsCount[0]?.count || '0')
      },
      message: 'Preview of records that would be deleted based on your retention settings'
    });

  } catch (error) {
    console.error('Data cleanup preview error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}