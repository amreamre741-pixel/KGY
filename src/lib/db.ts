import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const resolvedUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

export const db =
  globalForPrisma.prisma ??
  new PrismaClient(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
