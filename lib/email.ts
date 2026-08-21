import { Resend } from "resend";
import nodemailer from "nodemailer";

const resendApiKey = process.env.RESEND_API_KEY;
const rawFrom = (process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL)
  ?.trim()
  .replace(/^["']|["']$/g, "");
const isValidFrom =
  !!rawFrom &&
  (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawFrom) ||
    /^.+<[^>\s]+@[^>\s]+\.[^>\s]+>$/.test(rawFrom));
const resendFromAddress = isValidFrom
  ? rawFrom!
  : "Company Portal <onboarding@resend.dev>";

const smtpUser = process.env.EMAIL_USER?.trim();
const smtpPass = process.env.EMAIL_PASS?.trim().replace(/\s/g, "");
const smtpFrom =
  process.env.EMAIL_FROM?.trim() ||
  (smtpUser ? `Company Portal <${smtpUser}>` : undefined);

let resend: Resend | null = null;
let smtpTransporter: nodemailer.Transporter | null = null;

if (resendApiKey) {
  resend = new Resend(resendApiKey);
}

if (smtpUser && smtpPass) {
  smtpTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    secure: process.env.EMAIL_SECURE === "true",
    auth: { user: smtpUser, pass: smtpPass },
  });
}

function otpEmailHtml(otp: string, userName?: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2dd4bf 0%, #2878f0 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Company Portal</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #4b5563; line-height: 1.6;">
          ${userName ? `Hello ${userName},` : "Hello,"}
        </p>
        <p style="color: #4b5563; line-height: 1.6;">
          We received a request to reset your password for your Company Portal account.
          Your One-Time Password (OTP) is:
        </p>
        <div style="background: white; border: 2px solid #2878f0; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #2878f0; letter-spacing: 5px;">${otp}</span>
        </div>
        <p style="color: #4b5563; line-height: 1.6;">
          This OTP will expire in <strong>10 minutes</strong>. Please use it to reset your password.
        </p>
        <p style="color: #4b5563; line-height: 1.6;">
          If you didn't request this password reset, please ignore this email. Your account remains secure.
        </p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </div>
  `;
}

function confirmationEmailHtml(userName?: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2dd4bf 0%, #2878f0 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Company Portal</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin-top: 0;">Password Changed Successfully</h2>
        <p style="color: #4b5563; line-height: 1.6;">
          ${userName ? `Hello ${userName},` : "Hello,"}
        </p>
        <p style="color: #4b5563; line-height: 1.6;">
          Your Company Portal password was changed successfully. You can now sign in with your new password.
        </p>
        <p style="color: #4b5563; line-height: 1.6;">
          If you did not make this change, contact your administrator immediately.
        </p>
      </div>
    </div>
  `;
}

function isResendSandboxError(error: unknown): boolean {
  const err = error as { statusCode?: number; message?: string };
  return (
    err?.statusCode === 403 &&
    (err?.message?.includes("testing emails") ||
      err?.message?.includes("not verified"))
  );
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: unknown }> {
  if (!resend) {
    return { success: false, error: "Resend not configured" };
  }

  const { error } = await resend.emails.send({
    from: resendFromAddress,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[Resend API Error]:", error);
    return { success: false, error };
  }

  return { success: true };
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: unknown }> {
  if (!smtpTransporter || !smtpFrom) {
    return { success: false, error: "SMTP not configured" };
  }

  try {
    await smtpTransporter.sendMail({ from: smtpFrom, to, subject, html });
    return { success: true };
  } catch (error) {
    console.error("SMTP email error:", error);
    return { success: false, error };
  }
}

async function deliverEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: unknown }> {
  if (resend) {
    const resendResult = await sendViaResend(to, subject, html);
    if (resendResult.success) return resendResult;

    if (smtpTransporter && isResendSandboxError(resendResult.error)) {
      console.warn(
        `[Email] Resend restricted — falling back to SMTP for ${to}`
      );
      return sendViaSmtp(to, subject, html);
    }

    return resendResult;
  }

  if (smtpTransporter) {
    return sendViaSmtp(to, subject, html);
  }

  return { success: false, error: "No email provider configured" };
}

export function getEmailSendErrorMessage(error: unknown): string {
  const err = error as {
    statusCode?: number;
    message?: string;
    code?: string;
    responseCode?: number;
  };

  if (err?.code === "EAUTH" || err?.responseCode === 535) {
    return "Gmail SMTP login failed. Use a Gmail App Password (not your regular password) for EMAIL_PASS, with 2-Step Verification enabled on that Google account.";
  }

  if (isResendSandboxError(error) && !smtpTransporter) {
    return "Resend test mode only allows your account email. Add Gmail SMTP credentials (EMAIL_USER, EMAIL_PASS) in .env.local, or verify your domain at resend.com/domains.";
  }

  return "Failed to send OTP email. Please try again later.";
}

export async function sendOtpEmail(
  email: string,
  otp: string,
  userName?: string
): Promise<{ success: boolean; error?: unknown }> {
  return deliverEmail(
    email,
    "Password Reset OTP - Company Portal",
    otpEmailHtml(otp, userName)
  );
}

export async function sendPasswordResetConfirmation(
  email: string,
  userName?: string
): Promise<{ success: boolean; error?: unknown }> {
  return deliverEmail(
    email,
    "Password Changed - Company Portal",
    confirmationEmailHtml(userName)
  );
}
