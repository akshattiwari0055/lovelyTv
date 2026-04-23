import { OAuth2Client } from "google-auth-library";
import { config } from "./config.js";

const client = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

export async function verifyGoogleCredential(credential: string) {
  if (!client || !config.googleClientId) {
    throw new Error("Google auth is not configured");
  }

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: config.googleClientId
  });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new Error("Google account email is missing");
  }

  return {
    email: payload.email,
    fullName: payload.name ?? payload.email,
    googleId: payload.sub
  };
}
