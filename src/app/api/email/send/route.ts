import { NextRequest, NextResponse } from 'next/server';
import { sendDeviceAlert, sendSystemUpdate, DeviceAlertEmailData, SystemUpdateEmailData } from '@/lib/email-simple';
import { executeQuery } from '@/lib/database';

interface NotificationSettings {
  device_alerts: boolean;
  low_battery: boolean;
  system_updates: boolean;
  email_notifications: boolean;
}

interface User {
  id: string;
  email: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, userId, data } = body;

    if (!type || !userId || !data) {
      return NextResponse.json(
        { error: 'Type, userId, and data are required' },
        { status: 400 }
      );
    }

    // Get user email
    const userResult = await executeQuery(
      'SELECT id, email FROM auth.users WHERE id = $1',
      [userId]
    ) as User[];

    if (!userResult || userResult.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userResult[0];

    // Get user notification settings
    const settingsResult = await executeQuery(
      'SELECT device_alerts, low_battery, system_updates, email_notifications FROM notification_settings WHERE user_id = $1',
      [userId]
    ) as NotificationSettings[];

    const settings: NotificationSettings = settingsResult?.[0] || {
      device_alerts: true,
      low_battery: true,
      system_updates: true,
      email_notifications: true
    };

    // Check if email notifications are enabled
    if (!settings.email_notifications) {
      return NextResponse.json({
        success: false,
        message: 'Email notifications are disabled for this user'
      });
    }

    let result;

    switch (type) {
      case 'device_alert':
        // Check if device alerts are enabled
        if (!settings.device_alerts) {
          return NextResponse.json({
            success: false,
            message: 'Device alerts are disabled for this user'
          });
        }

        // Check if low battery alerts are enabled for battery-related alerts
        if (data.alertType === 'low_battery' && !settings.low_battery) {
          return NextResponse.json({
            success: false,
            message: 'Low battery alerts are disabled for this user'
          });
        }

        const deviceAlertData: DeviceAlertEmailData = {
          deviceName: data.deviceName,
          alertType: data.alertType,
          currentValue: data.currentValue,
          threshold: data.threshold,
          timestamp: new Date(data.timestamp || Date.now()),
          deviceSn: data.deviceSn
        };

        result = await sendDeviceAlert(user.email, deviceAlertData, userId);
        break;

      case 'system_update':
        // Check if system updates are enabled
        if (!settings.system_updates) {
          return NextResponse.json({
            success: false,
            message: 'System update notifications are disabled for this user'
          });
        }

        const systemUpdateData: SystemUpdateEmailData = {
          updateType: data.updateType || 'feature',
          title: data.title,
          description: data.description,
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined
        };

        result = await sendSystemUpdate(user.email, systemUpdateData, userId);
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid notification type' },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    // Log the notification (optional - for tracking purposes)
    try {
      await executeQuery(
        `INSERT INTO notification_logs (user_id, type, email, message_id, sent_at) 
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, type, user.email, result.messageId, new Date()]
      );
    } catch (logError) {
      console.warn('Failed to log notification:', logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Notification sent successfully'
    });

  } catch (error) {
    console.error('Email notification API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to send notifications (can be called from other parts of the app)
export async function sendNotification(
  userId: string,
  type: 'device_alert' | 'system_update',
  data: any
) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, type, data }),
    });

    return await response.json();
  } catch (error) {
    console.error('Failed to send notification:', error);
    return { success: false, error: 'Failed to send notification' };
  }
}