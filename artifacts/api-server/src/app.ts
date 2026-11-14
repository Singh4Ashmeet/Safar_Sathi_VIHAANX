import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { ipLimiter } from './middleware/rateLimits.js';
import { setupRoutes } from './routes.js';
import { errorHandler, AppError } from './lib/errors.js';

export const app = express();

// Security headers (Checklist 13.3)
app.use(helmet());

// CORS allow-list from ALLOWED_ORIGINS (Checklist 13.3)
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
  })
);

// Request ID generation / propagation (TRD T16)
app.use((req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const reqId = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId.trim()
    : randomUUID();
  (req as any).id = reqId;
  res.setHeader('x-request-id', reqId);
  next();
});

// Body parser with 64kb limit (TRD T16)
app.use(express.json({ limit: '64kb' }));

// Request logging with sensitive field redaction & request ID correlation
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as any).id || (req.headers['x-request-id'] as string) || randomUUID(),
    autoLogging: {
      ignore: (req) => req.url?.startsWith('/api/healthz') || req.url === '/healthz',
    },
  })
);

// Global per-IP rate limiter
app.use(ipLimiter);

// Mount all routes
setupRoutes(app);

// 404 Handler
app.use((req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
});

// Centralized error handler returning standard { error: { code, message, details? } } envelope
app.use(errorHandler);

