"use node";

import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Resend } from "resend";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";

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

interface TestEmailResult { success: boolean; messageId?: string; error?: string }
const TEST_EMAIL_SUBJECT = "EcoFlow Dashboard email test";

/** Explicitly requested diagnostics go only to the signed-in account. */
export const sendMyTestEmail = action({
  args: {},
  handler: async (ctx): Promise<TestEmailResult> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const attempt = await ctx.runMutation(internal.email_log.claimTestEmailAttempt, { userId });
    if (!attempt.allowed) return { success: false, error: attempt.error };
    return deliverTestEmail(ctx, {
      to: attempt.email, userId, logId: attempt.logId, firstName: attempt.firstName,
    });
  },
});

/** Retain the trusted backend entrypoint without exposing recipient arguments. */
export const sendTestEmail = internalAction({
  args: { to: v.string(), userId: v.id("users") },
  handler: async (ctx, args): Promise<TestEmailResult> => {
    const logId = await ctx.runMutation(internal.email_log.logNotification, {
      userId: args.userId, type: "test_email", email: args.to,
      subject: TEST_EMAIL_SUBJECT, status: "pending",
    });
    return deliverTestEmail(ctx, { ...args, logId });
  },
});

// ─── Test email delivery ─────────────────────────────────────────────────────

async function deliverTestEmail(ctx: ActionCtx, args: {
  to: string; userId: Id<"users">; logId: Id<"notificationLogs">; firstName?: string;
}): Promise<TestEmailResult> {
  const name = args.firstName?.trim().slice(0, 120) || "there";
  const settingsUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://my-ecoflow.vercel.app").replace(/\/$/, "")}/settings`;
  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${TEST_EMAIL_SUBJECT}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f4;color:#222;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;">
<div lang="en" dir="ltr" style="max-width:600px;margin:0 auto;padding:24px;background:#fff;border-radius:8px;">
<h1 style="font-size:24px;margin-top:0;">EcoFlow Dashboard email test</h1>
<p>Hello ${escapeHtml(name)},</p>
<p>This is the test email you requested from your EcoFlow Dashboard settings.</p>
<p>Receiving this message confirms it reached your mailbox.</p>
<p><a href="${escapeHtml(settingsUrl)}" style="color:#226311;">Manage your notification preferences</a></p>
</div></body></html>`;
  const text = `Hello ${name},\n\nThis is the test email you requested from your EcoFlow Dashboard settings.\nReceiving this message confirms it reached your mailbox.\n\nManage your notification preferences: ${settingsUrl}`;
  const apiKey = process.env.RESEND_API_KEY;
  let result: TestEmailResult;
  if (!apiKey) {
    result = { success: false, error: "Email service is not configured." };
  } else {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
          "Idempotency-Key": `ecoflow-test-email-${args.logId}`,
        },
        body: JSON.stringify({
          from: "EcoFlow Dashboard <alerts@devrunor.com>", to: args.to,
          subject: TEST_EMAIL_SUBJECT, html, text,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        result = { success: false, error: testEmailProviderError(response.status) };
      } else {
        const body: unknown = await response.json();
        const messageId = body !== null && typeof body === "object" && "id" in body ? body.id : undefined;
        result = typeof messageId === "string" && messageId.length > 0
          ? { success: true, messageId }
          : { success: false, error: "The email provider returned an incomplete response. Check your inbox before trying again." };
      }
    } catch {
      // A timeout can happen after acceptance. Do not retry a diagnostic send
      // automatically or expose provider responses and credentials to the UI.
      result = { success: false, error: "The test email could not be confirmed. Check your inbox before trying again." };
    }
  }
  try {
    await ctx.runMutation(internal.email_log.finishTestEmailAttempt, {
      logId: args.logId, userId: args.userId, status: result.success ? "sent" : "failed",
      messageId: result.messageId, errorMessage: result.error,
    });
  } catch {
    return {
      success: false, messageId: result.messageId,
      error: "The test email status could not be saved. Check your inbox before trying again.",
    };
  }
  return result;
}

function testEmailProviderError(status: number): string {
  if (status === 401 || status === 403) {
    return "The email provider rejected the sender configuration. Check the verified sending domain and API key.";
  }
  if (status === 400 || status === 422) {
    return "The email provider rejected the test message. Check the account email and sender configuration.";
  }
  if (status === 429) return "The email provider is busy. Please try again in a minute.";
  return "The email provider could not accept the test email. Please try again later.";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}
