import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set in environment variables');
}

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

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

// Email templates
export const generateDeviceAlertEmail = (data: DeviceAlertEmailData): EmailTemplate => {
  const alertMessages = {
    low_battery: {
      subject: `🔋 Low Battery Alert - ${data.deviceName}`,
      title: 'Low Battery Warning',
      message: `Your device battery level has dropped to ${data.currentValue}%, which is below your threshold of ${data.threshold}%.`,
      action: 'Consider charging your device soon to avoid power loss.'
    },
    offline: {
      subject: `📡 Device Offline - ${data.deviceName}`,
      title: 'Device Connection Lost',
      message: `Your device has gone offline and is no longer sending data.`,
      action: 'Please check your device connection and network status.'
    },
    high_temperature: {
      subject: `🌡️ High Temperature Alert - ${data.deviceName}`,
      title: 'Temperature Warning',
      message: `Device temperature has reached ${data.currentValue}°C, exceeding the safe threshold of ${data.threshold}°C.`,
      action: 'Please ensure proper ventilation and check for any blockages.'
    },
    overload: {
      subject: `⚡ Power Overload Alert - ${data.deviceName}`,
      title: 'Power Overload Detected',
      message: `Device is drawing ${data.currentValue}W, which exceeds the safe limit of ${data.threshold}W.`,
      action: 'Please reduce the load or disconnect some devices immediately.'
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
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #44af21, #00c356); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .content { padding: 30px; }
        .alert-box { background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 20px; margin: 20px 0; }
        .alert-title { font-size: 18px; font-weight: 600; margin-bottom: 10px; color: #856404; }
        .alert-message { margin-bottom: 15px; color: #856404; }
        .alert-action { font-weight: 500; color: #721c24; background-color: #f8d7da; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545; }
        .device-info { background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .device-info h3 { margin: 0 0 10px 0; font-size: 16px; color: #495057; }
        .device-detail { display: flex; justify-content: space-between; margin: 5px 0; }
        .device-detail span:first-child { font-weight: 500; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #6c757d; }
        .footer a { color: #44af21; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>EcoFlow Dashboard Alert</h1>
        </div>
        <div class="content">
          <div class="alert-box">
            <div class="alert-title">${alert.title}</div>
            <div class="alert-message">${alert.message}</div>
            <div class="alert-action">${alert.action}</div>
          </div>
          
          <div class="device-info">
            <h3>Device Information</h3>
            <div class="device-detail">
              <span>Device Name:</span>
              <span>${data.deviceName}</span>
            </div>
            <div class="device-detail">
              <span>Serial Number:</span>
              <span>${data.deviceSn}</span>
            </div>
            <div class="device-detail">
              <span>Alert Time:</span>
              <span>${formattedTime}</span>
            </div>
          </div>
          
          <p>You can view your device status and manage alerts in your <a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/dashboard" style="color: #44af21; text-decoration: none;">EcoFlow Dashboard</a>.</p>
        </div>
        <div class="footer">
          <p>This alert was sent because you have notifications enabled for this device.</p>
          <p><a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings">Manage notification preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

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

  return {
    subject: alert.subject,
    html,
    text
  };
};

export const generateSystemUpdateEmail = (data: SystemUpdateEmailData): EmailTemplate => {
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
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #44af21, #00c356); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .content { padding: 30px; }
        .update-box { background-color: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 6px; padding: 20px; margin: 20px 0; }
        .update-title { font-size: 18px; font-weight: 600; margin-bottom: 10px; color: #0066cc; }
        .update-description { color: #333; }
        .scheduled-date { background-color: #fff3cd; padding: 10px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #ffc107; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #6c757d; }
        .footer a { color: #44af21; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>EcoFlow Dashboard Update</h1>
        </div>
        <div class="content">
          <div class="update-box">
            <div class="update-title">${icon} ${data.title}</div>
            <div class="update-description">${data.description}</div>
            ${data.scheduledDate ? `
              <div class="scheduled-date">
                <strong>Scheduled Date:</strong> ${data.scheduledDate.toLocaleString()}
              </div>
            ` : ''}
          </div>
          
          <p>Visit your <a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/dashboard" style="color: #44af21; text-decoration: none;">EcoFlow Dashboard</a> to see the latest updates.</p>
        </div>
        <div class="footer">
          <p><a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings">Manage notification preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
EcoFlow Dashboard Update - ${data.title}

${data.description}

${data.scheduledDate ? `Scheduled Date: ${data.scheduledDate.toLocaleString()}` : ''}

Visit your dashboard: ${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/dashboard
Manage notifications: ${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings
  `;

  return {
    subject,
    html,
    text
  };
};

// Email sending functions
export const sendDeviceAlert = async (
  to: string,
  data: DeviceAlertEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const template = generateDeviceAlertEmail(data);
    
    const { data: result, error } = await resend.emails.send({
      from: 'EcoFlow Dashboard <alerts@ecoflow-dashboard.com>',
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (error) {
      console.error('Resend API error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: result?.id };
  } catch (error) {
    console.error('Email sending error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

export const sendSystemUpdate = async (
  to: string,
  data: SystemUpdateEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const template = generateSystemUpdateEmail(data);
    
    const { data: result, error } = await resend.emails.send({
      from: 'EcoFlow Dashboard <updates@ecoflow-dashboard.com>',
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (error) {
      console.error('Resend API error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: result?.id };
  } catch (error) {
    console.error('Email sending error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

// Test email function
export const sendTestEmail = async (
  to: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const { data: result, error } = await resend.emails.send({
      from: 'EcoFlow Dashboard <test@ecoflow-dashboard.com>',
      to,
      subject: '✅ EcoFlow Dashboard Email Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #44af21;">Email Notifications are Working!</h2>
          <p>This is a test email to confirm that your EcoFlow Dashboard email notifications are properly configured.</p>
          <p>You will now receive alerts for:</p>
          <ul>
            <li>Low battery warnings</li>
            <li>Device offline alerts</li>
            <li>High temperature warnings</li>
            <li>Power overload notifications</li>
            <li>System updates</li>
          </ul>
          <p><a href="${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings" style="color: #44af21;">Manage your notification preferences</a></p>
        </div>
      `,
      text: `
EcoFlow Dashboard Email Test

Email notifications are working! You will now receive alerts for device issues and system updates.

Manage your notification preferences: ${process.env.NEXTAUTH_URL || 'https://my-ecoflow.vercel.app'}/settings
      `,
    });

    if (error) {
      console.error('Resend API error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: result?.id };
  } catch (error) {
    console.error('Email sending error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

export { resend };