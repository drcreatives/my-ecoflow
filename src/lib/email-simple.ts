import { Resend } from 'resend';
import { executeQuery } from './database';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set in environment variables');
}

const resend = new Resend(process.env.RESEND_API_KEY);

export interface DeviceAlertEmailData {
  deviceName: string;
  alertType: 'low_battery' | 'offline' | 'high_temperature' | 'overload';
  currentValue?: number;
  threshold?: number;
  timestamp: Date;
  deviceSn: string;
}

export interface SystemUpdateEmailData {
  updateType: 'feature' | 'maintenance' | 'security';
  title: string;
  description: string;
  scheduledDate?: Date;
}

// Simplified email sending function using basic HTML
export const sendDeviceAlert = async (
  to: string,
  data: DeviceAlertEmailData,
  userId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const alertMessages = {
      low_battery: {
        subject: `🔋 Low Battery Alert - ${data.deviceName}`,
        title: 'Low Battery Warning',
        message: `Your device battery level has dropped to ${data.currentValue}%, which is below your threshold of ${data.threshold}%.`,
        action: 'Consider charging your device soon to avoid power loss.',
        color: '#f59e0b'
      },
      offline: {
        subject: `📡 Device Offline - ${data.deviceName}`,
        title: 'Device Connection Lost',
        message: `Your device has gone offline and is no longer sending data.`,
        action: 'Please check your device connection and network status.',
        color: '#ef4444'
      },
      high_temperature: {
        subject: `🌡️ High Temperature Alert - ${data.deviceName}`,
        title: 'Temperature Warning',
        message: `Device temperature has reached ${data.currentValue}°C, exceeding the safe threshold of ${data.threshold}°C.`,
        action: 'Please ensure proper ventilation and check for any blockages.',
        color: '#f97316'
      },
      overload: {
        subject: `⚡ Power Overload Alert - ${data.deviceName}`,
        title: 'Power Overload Detected',
        message: `Device is drawing ${data.currentValue}W, which exceeds the safe limit of ${data.threshold}W.`,
        action: 'Please reduce the load or disconnect some devices immediately.',
        color: '#dc2626'
      }
    };

    const alert = alertMessages[data.alertType];
    const formattedTime = data.timestamp.toLocaleString();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${alert.subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #44af21, #00c356); color: white; padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 600;">EcoFlow Dashboard Alert</h1>
    </div>
    <div style="padding: 30px;">
      <div style="background-color: #fff3cd; border: 1px solid ${alert.color}; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px; color: ${alert.color};">${alert.title}</div>
        <div style="margin-bottom: 15px; color: #333;">${alert.message}</div>
        <div style="font-weight: 500; color: #721c24; background-color: #f8d7da; padding: 10px; border-radius: 4px; border-left: 4px solid ${alert.color};">${alert.action}</div>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #495057;">Device Information</h3>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span style="font-weight: 500;">Device Name:</span>
          <span>${data.deviceName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span style="font-weight: 500;">Serial Number:</span>
          <span>${data.deviceSn}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span style="font-weight: 500;">Alert Time:</span>
          <span>${formattedTime}</span>
        </div>
      </div>
      
      <p>You can view your device status and manage alerts in your <a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/dashboard" style="color: #44af21; text-decoration: none;">EcoFlow Dashboard</a>.</p>
    </div>
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #6c757d;">
      <p>This alert was sent because you have notifications enabled for this device.</p>
      <p><a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings" style="color: #44af21; text-decoration: none;">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>`;

    const text = `
EcoFlow Dashboard Alert - ${alert.title}

${alert.message}

${alert.action}

Device Information:
- Device Name: ${data.deviceName}
- Serial Number: ${data.deviceSn}
- Alert Time: ${formattedTime}

View your dashboard: ${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/dashboard
Manage notifications: ${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings
`;

    const { data: result, error } = await resend.emails.send({
      from: 'EcoFlow Dashboard <alerts@devrunor.com>',
      to,
      subject: alert.subject,
      html,
      text,
    });

    if (error) {
      console.error('Resend API error:', error);
      
      // Log the failed notification
      try {
        await executeQuery(`
          INSERT INTO notification_logs (user_id, type, email, message_id, status, error_message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [userId, `device_alert_${data.alertType}`, to, null, 'failed', error.message]);
      } catch (logError) {
        console.error('Failed to log notification error:', logError);
      }
      
      return { success: false, error: error.message };
    }

    // Log the successful notification
    try {
      await executeQuery(`
        INSERT INTO notification_logs (user_id, type, email, message_id, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, `device_alert_${data.alertType}`, to, result?.id, 'sent']);
    } catch (logError) {
      console.error('Failed to log notification:', logError);
    }

    return { success: true, messageId: result?.id };
  } catch (error) {
    console.error('Email sending error:', error);
    
    // Log the failed notification
    try {
      await executeQuery(`
        INSERT INTO notification_logs (user_id, type, email, message_id, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [userId, `device_alert_${data.alertType}`, to, null, 'failed', error instanceof Error ? error.message : 'Unknown error']);
    } catch (logError) {
      console.error('Failed to log notification error:', logError);
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

export const sendSystemUpdate = async (
  to: string,
  data: SystemUpdateEmailData,
  userId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const updateIcons = {
      feature: '🚀',
      maintenance: '🔧',
      security: '🔒'
    };

    const icon = updateIcons[data.updateType];
    const subject = `${icon} ${data.title} - EcoFlow Dashboard`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #44af21, #00c356); color: white; padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 600;">EcoFlow Dashboard Update</h1>
    </div>
    <div style="padding: 30px;">
      <div style="background-color: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px; color: #0066cc;">${icon} ${data.title}</div>
        <div style="color: #333;">${data.description}</div>
        ${data.scheduledDate ? `
          <div style="background-color: #fff3cd; padding: 10px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #ffc107;">
            <strong>Scheduled Date:</strong> ${data.scheduledDate.toLocaleString()}
          </div>
        ` : ''}
      </div>
      
      <p>Visit your <a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/dashboard" style="color: #44af21; text-decoration: none;">EcoFlow Dashboard</a> to see the latest updates.</p>
    </div>
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #6c757d;">
      <p><a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings" style="color: #44af21; text-decoration: none;">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>`;

    const text = `
EcoFlow Dashboard Update - ${data.title}

${data.description}

${data.scheduledDate ? `Scheduled Date: ${data.scheduledDate.toLocaleString()}` : ''}

Visit your dashboard: ${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/dashboard
Manage notifications: ${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings
`;

    const { data: result, error } = await resend.emails.send({
      from: 'EcoFlow Dashboard <updates@devrunor.com>',
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error('Resend API error:', error);
      
      // Log the failed notification
      try {
        await executeQuery(`
          INSERT INTO notification_logs (user_id, type, email, message_id, status, error_message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [userId, `system_update_${data.updateType}`, to, null, 'failed', error.message]);
      } catch (logError) {
        console.error('Failed to log notification error:', logError);
      }
      
      return { success: false, error: error.message };
    }

    // Log the successful notification
    try {
      await executeQuery(`
        INSERT INTO notification_logs (user_id, type, email, message_id, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, `system_update_${data.updateType}`, to, result?.id, 'sent']);
    } catch (logError) {
      console.error('Failed to log notification:', logError);
    }

    return { success: true, messageId: result?.id };
  } catch (error) {
    console.error('Email sending error:', error);
    
    // Log the failed notification
    try {
      await executeQuery(`
        INSERT INTO notification_logs (user_id, type, email, message_id, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [userId, `system_update_${data.updateType}`, to, null, 'failed', error instanceof Error ? error.message : 'Unknown error']);
    } catch (logError) {
      console.error('Failed to log notification error:', logError);
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

// Test email function
export const sendTestEmail = async (
  to: string,
  userId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EcoFlow Dashboard Email Test</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #44af21, #00c356); color: white; padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 600;">✅ Email Test Successful!</h1>
    </div>
    <div style="padding: 30px;">
      <h2 style="color: #44af21; margin-top: 0;">Email Notifications are Working!</h2>
      <p>This is a test email to confirm that your EcoFlow Dashboard email notifications are properly configured.</p>
      <p>You will now receive alerts for:</p>
      <ul style="color: #555;">
        <li>Low battery warnings</li>
        <li>Device offline alerts</li>
        <li>High temperature warnings</li>
        <li>Power overload notifications</li>
        <li>System updates</li>
      </ul>
      <p><a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings" style="color: #44af21; text-decoration: none; font-weight: 500;">Manage your notification preferences →</a></p>
    </div>
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #6c757d;">
      <p>EcoFlow Dashboard - Device Monitoring Made Simple</p>
    </div>
  </div>
</body>
</html>`;

    const text = `
EcoFlow Dashboard Email Test

Email notifications are working! You will now receive alerts for device issues and system updates.

You will receive alerts for:
- Low battery warnings
- Device offline alerts  
- High temperature warnings
- Power overload notifications
- System updates

Manage your notification preferences: ${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings
`;

    const { data: result, error } = await resend.emails.send({
      from: 'EcoFlow Dashboard <test@devrunor.com>',
      to,
      subject: '✅ EcoFlow Dashboard Email Test',
      html,
      text,
    });

    if (error) {
      console.error('Resend API error:', error);
      
      // Log the failed notification
      try {
        await executeQuery(`
          INSERT INTO notification_logs (user_id, type, email, message_id, status, error_message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [userId, 'test_email', to, null, 'failed', error.message]);
      } catch (logError) {
        console.error('Failed to log notification error:', logError);
      }
      
      return { success: false, error: error.message };
    }

    // Log the successful notification
    try {
      await executeQuery(`
        INSERT INTO notification_logs (user_id, type, email, message_id, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, 'test_email', to, result?.id, 'sent']);
    } catch (logError) {
      console.error('Failed to log notification:', logError);
    }

    return { success: true, messageId: result?.id };
  } catch (error) {
    console.error('Email sending error:', error);
    
    // Log the failed notification
    try {
      await executeQuery(`
        INSERT INTO notification_logs (user_id, type, email, message_id, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [userId, 'test_email', to, null, 'failed', error instanceof Error ? error.message : 'Unknown error']);
    } catch (logError) {
      console.error('Failed to log notification error:', logError);
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

export { resend };