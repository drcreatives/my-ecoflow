"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Resend } from "resend";
import { Id } from "./_generated/dataModel";

// ─── Email Templates ─────────────────────────────────────────────────────────

function deviceAlertHtml(alert: {
  title: string;
  message: string;
  action: string;
  color: string;
  deviceName: string;
  deviceSn: string;
  time: string;
  dashboardUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;margin:0;padding:20px;background-color:#f4f4f4;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#44af21,#00c356);color:#fff;padding:30px;text-align:center;">
    <h1 style="margin:0;font-size:24px;">EcoFlow Dashboard Alert</h1>
  </div>
  <div style="padding:30px;">
    <div style="background:#fff3cd;border:1px solid ${alert.color};border-radius:6px;padding:20px;margin:20px 0;">
      <div style="font-size:18px;font-weight:600;margin-bottom:10px;color:${alert.color};">${alert.title}</div>
      <div style="margin-bottom:15px;color:#333;">${alert.message}</div>
      <div style="font-weight:500;color:#721c24;background:#f8d7da;padding:10px;border-radius:4px;border-left:4px solid ${alert.color};">${alert.action}</div>
    </div>
    <div style="background:#f8f9fa;padding:15px;border-radius:6px;margin:20px 0;">
      <h3 style="margin:0 0 10px;font-size:16px;color:#495057;">Device Information</h3>
      <p style="margin:5px 0;"><strong>Device:</strong> ${alert.deviceName}</p>
      <p style="margin:5px 0;"><strong>Serial:</strong> ${alert.deviceSn}</p>
      <p style="margin:5px 0;"><strong>Time:</strong> ${alert.time}</p>
    </div>
    <p>View your device in your <a href="${alert.dashboardUrl}/dashboard" style="color:#44af21;">EcoFlow Dashboard</a>.</p>
  </div>
  <div style="background:#f8f9fa;padding:20px;text-align:center;font-size:14px;color:#6c757d;">
    <p><a href="${alert.dashboardUrl}/settings" style="color:#44af21;">Manage notification preferences</a></p>
  </div>
</div>
</body></html>`;
}

const ALERT_TEMPLATES: Record<
  string,
  {
    subject: (name: string) => string;
    title: string;
    message: (val?: number, threshold?: number) => string;
    action: string;
    color: string;
  }
> = {
  low_battery: {
    subject: (n) => `🔋 Low Battery Alert - ${n}`,
    title: "Low Battery Warning",
    message: (v, t) =>
      `Your device battery level has dropped to ${v}%, below your threshold of ${t}%.`,
    action: "Consider charging your device soon to avoid power loss.",
    color: "#f59e0b",
  },
  offline: {
    subject: (n) => `📡 Device Offline - ${n}`,
    title: "Device Connection Lost",
    message: () => "Your device has gone offline and is no longer sending data.",
    action: "Please check your device connection and network status.",
    color: "#ef4444",
  },
  high_temperature: {
    subject: (n) => `🌡️ High Temperature Alert - ${n}`,
    title: "Temperature Warning",
    message: (v, t) =>
      `Device temperature has reached ${v}°C, exceeding the safe threshold of ${t}°C.`,
    action: "Please ensure proper ventilation and check for any blockages.",
    color: "#f97316",
  },
  overload: {
    subject: (n) => `⚡ Power Overload Alert - ${n}`,
    title: "Power Overload Detected",
    message: (v, t) =>
      `Device is drawing ${v}W, which exceeds the safe limit of ${t}W.`,
    action: "Please reduce the load or disconnect some devices immediately.",
    color: "#dc2626",
  },
};

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Send a device alert email and log the result.
 */
export const sendDeviceAlertEmail = internalAction({
  args: {
    to: v.string(),
    userId: v.id("users"),
    deviceName: v.string(),
    deviceSn: v.string(),
    alertType: v.string(),
    currentValue: v.optional(v.float64()),
    threshold: v.optional(v.float64()),
    deviceId: v.optional(v.id("devices")),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set");
      return { success: false, error: "Email service not configured" };
    }

    const template = ALERT_TEMPLATES[args.alertType];
    if (!template) {
      return { success: false, error: `Unknown alert type: ${args.alertType}` };
    }

    const dashboardUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://my-ecoflow.vercel.app";
    const subject = template.subject(args.deviceName);
    const time = new Date().toLocaleString();

    const html = deviceAlertHtml({
      title: template.title,
      message: template.message(args.currentValue, args.threshold),
      action: template.action,
      color: template.color,
      deviceName: args.deviceName,
      deviceSn: args.deviceSn,
      time,
      dashboardUrl,
    });

    const resend = new Resend(apiKey);
    try {
      const { data, error } = await resend.emails.send({
        from: "EcoFlow Dashboard <alerts@devrunor.com>",
        to: args.to,
        subject,
        html,
      });

      const logStatus = error ? "failed" : "sent";

      // Log notification
      await ctx.runMutation(internal.email_log.logNotification, {
        userId: args.userId,
        type: `device_alert_${args.alertType}`,
        email: args.to,
        deviceId: args.deviceId,
        subject,
        messageId: data?.id,
        status: logStatus,
        errorMessage: error?.message,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, messageId: data?.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";

      await ctx.runMutation(internal.email_log.logNotification, {
        userId: args.userId,
        type: `device_alert_${args.alertType}`,
        email: args.to,
        subject,
        status: "failed",
        errorMessage: msg,
      });

      return { success: false, error: msg };
    }
  },
});

/**
 * Send a test email to verify email configuration.
 */
export const sendTestEmail = internalAction({
  args: {
    to: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { success: false, error: "RESEND_API_KEY not set" };
    }

    const resend = new Resend(apiKey);
    const dashboardUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://my-ecoflow.vercel.app";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;background:#f4f4f4;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#44af21,#00c356);color:#fff;padding:30px;text-align:center;">
    <h1 style="margin:0;font-size:24px;">✅ Email Test Successful!</h1>
  </div>
  <div style="padding:30px;">
    <h2 style="color:#44af21;margin-top:0;">Email Notifications are Working!</h2>
    <p>This is a test email to confirm that your EcoFlow Dashboard email notifications are properly configured.</p>
    <p><a href="${dashboardUrl}/settings" style="color:#44af21;">Manage your notification preferences →</a></p>
  </div>
</div>
</body></html>`;

    try {
      const { data, error } = await resend.emails.send({
        from: "EcoFlow Dashboard <test@devrunor.com>",
        to: args.to,
        subject: "✅ EcoFlow Dashboard Email Test",
        html,
      });

      await ctx.runMutation(internal.email_log.logNotification, {
        userId: args.userId,
        type: "test_email",
        email: args.to,
        subject: "✅ EcoFlow Dashboard Email Test",
        messageId: data?.id,
        status: error ? "failed" : "sent",
        errorMessage: error?.message,
      });

      if (error) return { success: false, error: error.message };
      return { success: true, messageId: data?.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: msg };
    }
  },
});
