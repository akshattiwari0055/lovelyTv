import nodemailer from "nodemailer";
import { config } from "./config.js";

export const mailer =
  config.smtpUser && config.smtpPass
    ? nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
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
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    throw new Error(`SMTP verification failed: ${message}`);
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
    const message = error instanceof Error ? error.message : "Unknown mail send error";
    throw new Error(`Could not deliver OTP email: ${message}`);
  }
}
