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

export async function sendOtpEmail(email: string, otp: string) {
  if (!mailer) {
    throw new Error("SMTP is not configured");
  }

  await mailer.sendMail({
    from: config.mailFrom,
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
}
