import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';

function standardLimitHandler(_req: Request, res: Response) {
  res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  });
}

// Global per-IP rate limiter (TRD T16)
export const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardLimitHandler,
});

// Per-user rate limiter for authenticated endpoints
export const userLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === 'test' ? 10000 : 120,
  keyGenerator: (req) => req.user?.uid || req.ip || 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardLimitHandler,
});

// Stricter per-user rate limiter for sensitive operations (SOS creation, relay bundle)
export const sensitiveUserLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === 'test' ? 10000 : 30,
  keyGenerator: (req) => req.user?.uid || req.ip || 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardLimitHandler,
});

// Public tracking rate limiter - per-IP to prevent enumeration/abuse
export const publicTrackingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === 'test' ? 10000 : 60,
  keyGenerator: (req) => req.ip || 'public-tracking',
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardLimitHandler,
});

// Relay upload is intentionally gateway-facing, so it cannot use the user limiter.
// Keep the work factor bounded before packet decoding/signature verification.
export const relayLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.NODE_ENV === 'test' ? 10000 : 60,
  keyGenerator: (req) => req.ip || 'relay-gateway',
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardLimitHandler,
});

// Dedicated rate limiter for /internal/tick (TRD T20)
// Prevents abusive triggering of ticks
export const tickLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === 'test' ? 10000 : 12, // Allow up to 12 ticks/min (e.g. 5s)
  keyGenerator: (req) => req.ip || 'internal',
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardLimitHandler,
});

