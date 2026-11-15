import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown, code = 'BAD_REQUEST') => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to perform this action') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, details?: unknown, code = 'CONFLICT') => new AppError(409, code, message, details);
export const tooMany = () => new AppError(429, 'TOO_MANY_REQUESTS', 'Too many attempts, please try again later');

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

/** Maps any thrown error to an HTTP status + JSON body (single place for error handling). */
export function toErrorPayload(err: unknown, path?: string): { status: number; body: ErrorBody } {
  const out = (status: number, code: string, message: string, details?: unknown) => ({ status, body: { error: { code, message, details } } });
  if (err instanceof ZodError) return out(422, 'VALIDATION_ERROR', 'Validation failed', err.flatten());
  if (err instanceof AppError) return out(err.status, err.code, err.message, err.details);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return out(409, 'UNIQUE_VIOLATION', 'A record with the same unique value already exists', err.meta);
    if (err.code === 'P2025') return out(404, 'NOT_FOUND', 'Record not found');
    if (err.code === 'P2003') return out(409, 'FK_VIOLATION', 'Record is referenced by other records', err.meta);
  }
  logger.error({ err, path }, 'Unhandled error');
  return out(500, 'INTERNAL_ERROR', 'Unexpected server error');
}
