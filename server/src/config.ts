import dotenv from "dotenv";

dotenv.config();

function parseAllowedOrigins() {
  const values = [
    process.env.CLIENT_URL,
    process.env.CLIENT_URLS,
    "http://localhost:5173",
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
  smtpHost: process.env.SMTP_HOST ?? "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  mailFrom: process.env.MAIL_FROM ?? "LPU TV <no-reply@example.com>"
};
