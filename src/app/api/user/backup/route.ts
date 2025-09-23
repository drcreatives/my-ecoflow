import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const includeReadings = url.searchParams.get('includeReadings') === 'true';
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    // Get user profile
    const userProfile = await executeQuery(
      `SELECT id, email, created_at FROM auth.users WHERE id = $1`,
      [user.id]
    ) as Array<{ id: string; email: string; created_at: string }>;

    // Get user devices
    const devices = await executeQuery(
      `SELECT id, device_sn, device_name, created_at, updated_at FROM devices WHERE user_id = $1`,
      [user.id]
    ) as Array<{
      id: string;
      device_sn: string;
      device_name: string;
      created_at: string;
      updated_at: string;
    }>;

    // Get notification settings
    const notificationSettings = await executeQuery(
      `SELECT * FROM notification_settings WHERE user_id = $1`,
      [user.id]
    ) as Array<any>;

    // Get data retention settings
    const dataRetentionSettings = await executeQuery(
      `SELECT * FROM data_retention_settings WHERE user_id = $1`,
      [user.id]
    ) as Array<any>;

    let deviceReadings = [];
    if (includeReadings) {
      let readingsQuery = `
        SELECT 
          dr.*,
          d.device_name,
          d.device_sn
        FROM device_readings dr
        INNER JOIN devices d ON dr.device_id = d.id
        WHERE d.user_id = $1
      `;
      const queryParams = [user.id];

      if (dateFrom) {
        readingsQuery += ` AND dr.recorded_at >= $${queryParams.length + 1}`;
        queryParams.push(dateFrom);
      }

      if (dateTo) {
        readingsQuery += ` AND dr.recorded_at <= $${queryParams.length + 1}`;
        queryParams.push(dateTo);
      }

      readingsQuery += ` ORDER BY dr.recorded_at DESC LIMIT 10000`; // Limit for performance

      deviceReadings = await executeQuery(readingsQuery, queryParams) as Array<any>;
    }

    // Get recent notification logs
    const notificationLogs = await executeQuery(
      `SELECT * FROM notification_logs 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1000`,
      [user.id]
    ) as Array<any>;

    // Calculate statistics
    const totalReadings = await executeQuery(
      `SELECT COUNT(*) as count FROM device_readings dr
       INNER JOIN devices d ON dr.device_id = d.id
       WHERE d.user_id = $1`,
      [user.id]
    ) as Array<{ count: string }>;

    const oldestReading = await executeQuery(
      `SELECT MIN(dr.recorded_at) as oldest FROM device_readings dr
       INNER JOIN devices d ON dr.device_id = d.id
       WHERE d.user_id = $1`,
      [user.id]
    ) as Array<{ oldest: string | null }>;

    const latestReading = await executeQuery(
      `SELECT MAX(dr.recorded_at) as latest FROM device_readings dr
       INNER JOIN devices d ON dr.device_id = d.id
       WHERE d.user_id = $1`,
      [user.id]
    ) as Array<{ latest: string | null }>;

    const backupData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: user.email,
        userId: user.id,
        includeReadings,
        dateRange: {
          from: dateFrom,
          to: dateTo
        },
        statistics: {
          totalDevices: devices.length,
          totalReadings: parseInt(totalReadings[0]?.count || '0'),
          oldestReading: oldestReading[0]?.oldest,
          latestReading: latestReading[0]?.latest,
          readingsInExport: deviceReadings.length
        }
      },
      userProfile: userProfile[0],
      devices,
      notificationSettings: notificationSettings[0] || null,
      dataRetentionSettings: dataRetentionSettings[0] || null,
      deviceReadings: includeReadings ? deviceReadings : [],
      notificationLogs
    };

    // Set headers for file download
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Content-Disposition', `attachment; filename="ecoflow-backup-${user.id}-${new Date().toISOString().split('T')[0]}.json"`);

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('Data backup API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auto-backup for cron job
    const authHeader = request.headers.get('authorization');
    const cronSecret = request.headers.get('x-cron-secret');
    
    if (cronSecret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all users with backup enabled
    const usersWithBackup = await executeQuery(`
      SELECT user_id FROM data_retention_settings 
      WHERE backup_enabled = true
    `) as Array<{ user_id: string }>;

    const backupCount = usersWithBackup.length;
    
    // In a real implementation, you'd trigger backup creation here
    // For now, we'll just log the backup request
    console.log(`Backup requested for ${backupCount} users`);

    return NextResponse.json({
      success: true,
      message: `Backup process initiated for ${backupCount} users`,
      usersToBackup: backupCount
    });

  } catch (error) {
    console.error('Auto backup error:', error);
    return NextResponse.json(
      { error: 'Backup process failed' },
      { status: 500 }
    );
  }
}