import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Cache on globalThis in ALL environments — in serverless (Vercel) each warm lambda
// reuses this instance instead of opening a new connection on every request.
// Neon's pooled DATABASE_URL already handles pgbouncer-style connection pooling;
// Prisma's connection_limit should be 1 per lambda (add ?connection_limit=1 to
// DATABASE_URL in Vercel env if connection exhaustion becomes an issue under load).
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'] });

globalForPrisma.prisma = prisma;
