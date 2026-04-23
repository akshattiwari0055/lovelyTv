import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

const OTP_LIFETIME_MS = 20 * 60 * 1000;
const OTP_LOCK_EXTENSION_MS = 30 * 60 * 1000;

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createOtp(email: string, purpose: string) {
  const otp = generateOtp();
  const codeHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS);

  await prisma.emailOtp.deleteMany({
    where: {
      email: email.toLowerCase(),
      purpose
    }
  });

  await prisma.emailOtp.create({
    data: {
      email: email.toLowerCase(),
      purpose,
      codeHash,
      expiresAt
    }
  });

  return otp;
}

async function getLatestOtpRecord(email: string, purpose: string) {
  return prisma.emailOtp.findFirst({
    where: {
      email: email.toLowerCase(),
      purpose
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function checkOtp(email: string, purpose: string, otp: string) {
  const record = await getLatestOtpRecord(email, purpose);

  if (!record) {
    return false;
  }

  if (record.expiresAt.getTime() < Date.now()) {
    return false;
  }

  const matches = await bcrypt.compare(otp, record.codeHash);

  if (matches) {
    await prisma.emailOtp.update({
      where: {
        id: record.id
      },
      data: {
        expiresAt: new Date(Date.now() + OTP_LOCK_EXTENSION_MS)
      }
    });
  }

  return matches;
}

export async function verifyOtp(email: string, purpose: string, otp: string) {
  const record = await getLatestOtpRecord(email, purpose);

  if (!record) {
    return false;
  }

  if (record.expiresAt.getTime() < Date.now()) {
    return false;
  }

  const matches = await bcrypt.compare(otp, record.codeHash);

  if (matches) {
    await prisma.emailOtp.deleteMany({
      where: {
        email: email.toLowerCase(),
        purpose
      }
    });
  }

  return matches;
}
