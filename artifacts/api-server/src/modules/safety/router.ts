import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateQuery, validateBody } from '../../middleware/validate.js';
import { safetyService } from './service.js';
import { listSafetyZonesSchema, submitSafetyReportSchema } from './validation.js';

export const safetyRouter = Router();

// Safety endpoints require verified Firebase auth (FR-10)
safetyRouter.use(requireAuth);

/**
 * GET /safety/zones
 * FR-10: Zones near lat, lng, radius, timeOfDay
 */
safetyRouter.get('/zones', validateQuery(listSafetyZonesSchema), async (req, res, next) => {
  try {
    const { lat, lng, radius, timeOfDay } = req.query;
    const result = await safetyService.getZonesNearby(
      Number(lat),
      Number(lng),
      radius ? Number(radius) : 5000,
      timeOfDay as string | undefined
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /safety/reports
 * FR-10: Submit a report (rate-limited)
 */
safetyRouter.post('/reports', validateBody(submitSafetyReportSchema), async (req, res, next) => {
  try {
    const result = await safetyService.submitReport(req.user!.uid, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

