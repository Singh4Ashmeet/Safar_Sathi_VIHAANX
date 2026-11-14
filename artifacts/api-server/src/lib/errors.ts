import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function notImplemented(featureDescription = 'Feature not implemented yet'): AppError {
  return new AppError(501, 'NOT_IMPLEMENTED', featureDescription);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. AppError (domain & operational errors)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    } satisfies ErrorEnvelope);
    return;
  }

  // 2. Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues,
      },
    } satisfies ErrorEnvelope);
    return;
  }

  // 3. Body-parser PayloadTooLargeError (> 64KB)
  if (
    typeof err === 'object' &&
    err !== null &&
    (('type' in err && (err as any).type === 'entity.too.large') ||
     ('status' in err && (err as any).status === 413) ||
     ('statusCode' in err && (err as any).statusCode === 413))
  ) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds the maximum allowed size (64KB)',
      },
    } satisfies ErrorEnvelope);
    return;
  }

  // 4. Body-parser SyntaxError (Malformed JSON in request body)
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as any).status === 400 &&
    'body' in err
  ) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body',
      },
    } satisfies ErrorEnvelope);
    return;
  }

  // 5. Unhandled internal server error (sanitized: never leak SQL, credentials, or internal stack traces)
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled server error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
    },
  } satisfies ErrorEnvelope);
}

