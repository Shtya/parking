import { PrismaClient } from '@prisma/client';
import { runtimeDatabaseUrl } from './database-url';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = process.env.DATABASE_URL ? runtimeDatabaseUrl(process.env.DATABASE_URL) : undefined;
export const prisma = globalForPrisma.prisma ?? new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
