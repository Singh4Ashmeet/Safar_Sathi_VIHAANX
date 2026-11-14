import type { Request, Response, NextFunction } from 'express';
import type { AnyZodObject } from 'zod';
import { AppError } from '../lib/errors.js';

export function validateBody(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const result = await schema.safeParseAsync(req.body);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request body', result.error.issues));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const result = await schema.safeParseAsync(req.query);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid query parameters', result.error.issues));
    }
    req.query = result.data;
    next();
  };
}

export function validateParams(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const result = await schema.safeParseAsync(req.params);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid path parameters', result.error.issues));
    }
    req.params = result.data;
    next();
  };
}

