import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { ridesService } from './service.js';
import { registerRideSchema } from './validation.js';

export const ridesRouter = Router();

// Rides endpoints require verified Firebase auth (FR-11)
ridesRouter.use(requireAuth);

/**
 * POST /rides
 * FR-11: Register ride (plate, driver, expected route)
 */
ridesRouter.post('/', validateBody(registerRideSchema), async (req, res, next) => {
  try {
    const result = await ridesService.registerRide(req.user!.uid, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

