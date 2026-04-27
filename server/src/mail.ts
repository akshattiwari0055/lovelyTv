import nodemailer from "nodemailer";
import { config } from "./config.js";

function getSmtpErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown SMTP error";
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const responseCode = typeof error === "object" && error && "responseCode" in error ? Number(error.responseCode) : 0;
  const lowerMessage = message.toLowerCase();

  if (responseCode === 535 || lowerMessage.includes("invalid login") || lowerMessage.includes("authentication")) {
    return `${message}. Check SMTP_USER and SMTP_PASS. For Gmail, use a Google App Password, not your normal account password.`;
  }

  if (responseCode === 550 || lowerMessage.includes("sender") || lowerMessage.includes("from address")) {
    return `${message}. MAIL_FROM must use the same mailbox as SMTP_USER or an address allowed by your SMTP provider.`;
  }

  if (code === "ETIMEDOUT" || code === "ECONNECTION" || lowerMessage.includes("greeting never received")) {
    return `${message}. Check SMTP_HOST, SMTP_PORT, SMTP_SECURE and whether the hosting provider allows outbound SMTP.`;
  }

  return message;
}

export const mailer =
  config.smtpUser && config.smtpPass
    ? nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        requireTLS: !config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass
        }
      })
    : null;

let mailerVerified = false;

async function ensureMailerReady() {
  if (!mailer) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and MAIL_FROM.");
  }

  if (mailerVerified) return;

  try {
    await mailer.verify();
    mailerVerified = true;
  } catch (error) {
    throw new Error(`SMTP verification failed: ${getSmtpErrorMessage(error)}`);
  }
}

export async function sendOtpEmail(email: string, otp: string) {
  await ensureMailerReady();

  try {
    await mailer!.sendMail({
      from: config.mailFrom || config.smtpUser,
      to: email,
      subject: "Your LPU TV verification code",
      text: `Your LPU TV OTP is ${otp}. It expires in 20 minutes.`,
      html: `<div style="font-family:Arial,sans-serif;padding:24px">
        <h2>LPU TV verification</h2>
        <p>Your OTP is:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${otp}</div>
        <p>This code expires in 20 minutes.</p>
      </div>`
    });
  } catch (error) {
    throw new Error(`Could not deliver OTP email: ${getSmtpErrorMessage(error)}`);
  }
}
