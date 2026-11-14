import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { constantTimeEqual } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';

/**
 * Validates the X-Tick-Secret header using constant-time comparison (TRD T20).
 * Protects /internal/tick from unauthorized triggers.
 */
export function requireTickSecret(req: Request, _res: Response, next: NextFunction): void {
  const secretHeader = req.headers['x-tick-secret'];

  if (typeof secretHeader !== 'string' || !secretHeader) {
    return next(new AppError(401, 'UNAUTHORIZED_TICK', 'Missing or invalid X-Tick-Secret header'));
  }

  if (!constantTimeEqual(secretHeader, env.TICK_SECRET)) {
    return next(new AppError(401, 'UNAUTHORIZED_TICK', 'Invalid X-Tick-Secret'));
  }

  next();
}

