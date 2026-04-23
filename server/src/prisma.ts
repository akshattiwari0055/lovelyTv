import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "";

if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
  throw new Error(
    'Invalid DATABASE_URL for the current Prisma schema. Use a PostgreSQL connection string like "postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public".'
  );
}

export const prisma = new PrismaClient();
