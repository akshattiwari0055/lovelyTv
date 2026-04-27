import dotenv from "dotenv";

dotenv.config();

function envValue(name: string, fallback = "") {
  return (process.env[name] ?? fallback).trim();
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const smtpPort = Number(envValue("SMTP_PORT", "587"));
const smtpHost = envValue("SMTP_HOST", "smtp.gmail.com");
const smtpUser = envValue("SMTP_USER");
const smtpPass = envValue("SMTP_PASS");
const normalizedSmtpPass = smtpHost.includes("gmail.com") ? smtpPass.replace(/\s+/g, "") : smtpPass;

function parseAllowedOrigins() {
  const values = [
    process.env.CLIENT_URL,
    process.env.CLIENT_URLS,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173"
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  clientUrls: parseAllowedOrigins(),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
  zegoAppId: Number(process.env.ZEGO_APP_ID ?? 0),
  zegoServerSecret: process.env.ZEGO_SERVER_SECRET ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  smtpHost,
  smtpPort,
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, smtpPort === 465),
  smtpUser,
  smtpPass: normalizedSmtpPass,
  mailFrom: envValue("MAIL_FROM", smtpUser ? `CampusTV <${smtpUser}>` : "CampusTV <no-reply@example.com>")
};
