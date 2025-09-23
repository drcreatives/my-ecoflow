import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';
import { sendDeviceAlert } from '@/lib/email-simple';

interface DeviceReading {
  device_id: string;
  device_name: string;
  device_sn: string;
  battery_level: number;
  ac_output_watts: number;
  dc_output_watts: number;
  usb_output_watts: number;
  temperature: number;
  recorded_at: string;
  user_id: string;
  user_email: string;
}

interface NotificationSettings {
  user_id: string;
  device_alerts: boolean;
  low_battery: boolean;
  low_battery_threshold: number;
  power_threshold: boolean;
  power_threshold_watts: number;
  system_updates: boolean;
  weekly_reports: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
}

// Check if we already sent a notification recently to avoid spam
const checkRecentNotification = async (userId: string, deviceId: string, alertType: string): Promise<boolean> => {
  const recentThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
  
  const result = await executeQuery(
    `SELECT COUNT(*) as count 
     FROM notification_logs 
     WHERE user_id = $1 AND device_id = $2 AND notification_type = $3 AND created_at > $4`,
    [userId, deviceId, alertType, recentThreshold.toISOString()]
  ) as { count: string }[];
  
  return parseInt(result?.[0]?.count || '0') > 0;
};

// Log notification to database
const logNotification = async (
  userId: string, 
  deviceId: string, 
  notificationType: string, 
  emailAddress: string, 
  subject: string, 
  messageId?: string, 
  error?: string
) => {
  await executeQuery(
    `INSERT INTO notification_logs (user_id, device_id, notification_type, email_address, subject, message_id, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      deviceId,
      notificationType,
      emailAddress,
      subject,
      messageId || null,
      error ? 'failed' : 'sent',
      error || null
    ]
  );
};

export async function POST(request: NextRequest) {
  try {
    // Verify this is a cron job or admin request (you can add auth header check here)
    const authHeader = request.headers.get('authorization');
    const cronSecret = request.headers.get('x-cron-secret');
    
    if (cronSecret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get latest device readings with user info and notification settings
    const deviceReadings = await executeQuery(`
      SELECT 
        dr.device_id,
        d.device_name,
        d.device_sn,
        dr.battery_level,
        dr.ac_output_watts,
        dr.dc_output_watts,
        dr.usb_output_watts,
        dr.temperature,
        dr.recorded_at,
        u.id as user_id,
        u.email as user_email
      FROM device_readings dr
      INNER JOIN devices d ON dr.device_id = d.id
      INNER JOIN auth.users u ON d.user_id = u.id::text
      WHERE dr.recorded_at > NOW() - INTERVAL '1 hour'
      ORDER BY dr.recorded_at DESC
    `) as DeviceReading[];

    if (deviceReadings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No recent device readings found'
      });
    }

    // Get all users' notification settings
    const notificationSettings = await executeQuery(`
      SELECT * FROM notification_settings
    `) as NotificationSettings[];

    const settingsMap = new Map<string, NotificationSettings>();
    notificationSettings.forEach(setting => {
      settingsMap.set(setting.user_id, setting);
    });

    let notificationsSent = 0;
    const alerts = [];

    // Process each device reading
    for (const reading of deviceReadings) {
      const userSettings = settingsMap.get(reading.user_id);
      if (!userSettings) continue;

      const deviceId = reading.device_id;
      const userId = reading.user_id;
      const userEmail = reading.user_email;

      // Check for low battery alert
      if (userSettings.low_battery && 
          reading.battery_level <= userSettings.low_battery_threshold) {
        
        const alertType = 'low_battery';
        const hasRecentAlert = await checkRecentNotification(userId, deviceId, alertType);
        
        if (!hasRecentAlert) {
          const emailResult = await sendDeviceAlert(userEmail, {
            deviceName: reading.device_name,
            alertType: 'low_battery',
            currentValue: reading.battery_level,
            threshold: userSettings.low_battery_threshold,
            timestamp: new Date(reading.recorded_at),
            deviceSn: reading.device_sn
          }, userId);

          await logNotification(
            userId,
            deviceId,
            alertType,
            userEmail,
            `🔋 Low Battery Alert - ${reading.device_name}`,
            emailResult.messageId,
            emailResult.error
          );

          if (emailResult.success) {
            notificationsSent++;
            alerts.push({
              type: 'low_battery',
              device: reading.device_name,
              value: reading.battery_level,
              threshold: userSettings.low_battery_threshold
            });
          }
        }
      }

      // Check for power overload (using power_threshold setting)
      if (userSettings.power_threshold) {
        const totalOutput = (reading.ac_output_watts || 0) + (reading.dc_output_watts || 0) + (reading.usb_output_watts || 0);
        const maxSafeLoad = userSettings.power_threshold_watts; // Use user's configured threshold
        
        if (totalOutput > maxSafeLoad) {
          const alertType = 'overload';
          const hasRecentAlert = await checkRecentNotification(userId, deviceId, alertType);
          
          if (!hasRecentAlert) {
            const emailResult = await sendDeviceAlert(userEmail, {
              deviceName: reading.device_name,
              alertType: 'overload',
              currentValue: totalOutput,
              threshold: maxSafeLoad,
              timestamp: new Date(reading.recorded_at),
              deviceSn: reading.device_sn
            }, userId);

            await logNotification(
              userId,
              deviceId,
              alertType,
              userEmail,
              `⚡ Power Overload Alert - ${reading.device_name}`,
              emailResult.messageId,
              emailResult.error
            );

            if (emailResult.success) {
              notificationsSent++;
              alerts.push({
                type: 'power_overload',
                device: reading.device_name,
                value: totalOutput,
                threshold: maxSafeLoad
              });
            }
          }
        }
      }
    }

    // Check for offline devices (no readings in last hour)
    const offlineDevices = await executeQuery(`
      SELECT 
        d.id as device_id,
        d.device_name,
        d.device_sn,
        u.id as user_id,
        u.email as user_email
      FROM devices d
      INNER JOIN auth.users u ON d.user_id = u.id::text
      LEFT JOIN device_readings dr ON d.id = dr.device_id AND dr.recorded_at > NOW() - INTERVAL '1 hour'
      WHERE dr.device_id IS NULL
    `) as { device_id: string; device_name: string; device_sn: string; user_id: string; user_email: string }[];

    for (const device of offlineDevices) {
      const userSettings = settingsMap.get(device.user_id);
      if (!userSettings?.device_alerts) continue;

      const alertType = 'offline';
      const hasRecentAlert = await checkRecentNotification(device.user_id, device.device_id, alertType);
      
      if (!hasRecentAlert) {
        const emailResult = await sendDeviceAlert(device.user_email, {
          deviceName: device.device_name,
          alertType: 'offline',
          timestamp: new Date(),
          deviceSn: device.device_sn
        }, device.user_id);

        await logNotification(
          device.user_id,
          device.device_id,
          alertType,
          device.user_email,
          `📡 Device Offline - ${device.device_name}`,
          emailResult.messageId,
          emailResult.error
        );

        if (emailResult.success) {
          notificationsSent++;
          alerts.push({
            type: 'device_offline',
            device: device.device_name
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Device monitoring completed. ${notificationsSent} notifications sent.`,
      notificationsSent,
      alerts,
      readingsProcessed: deviceReadings.length,
      offlineDevicesChecked: offlineDevices.length
    });

  } catch (error) {
    console.error('Device monitoring error:', error);
    return NextResponse.json(
      { 
        error: 'Device monitoring failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}