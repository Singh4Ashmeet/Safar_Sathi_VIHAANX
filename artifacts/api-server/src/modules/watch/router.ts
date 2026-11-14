import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { watchService } from './service.js';
import { startWatchSchema, confirmWatchParamsSchema } from './validation.js';

export const watchRouter = Router();

// Watch Me endpoints require verified Firebase auth (FR-09)
watchRouter.use(requireAuth);

/**
 * POST /watch
 * FR-09: Start Watch Me (minutes)
 */
watchRouter.post('/', validateBody(startWatchSchema), async (req, res, next) => {
  try {
    const result = await watchService.startWatch(req.user!.uid, req.body.minutes);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /watch/:id/confirm
 * FR-09: User confirms safe
 */
watchRouter.post('/:id/confirm', validateParams(confirmWatchParamsSchema), async (req, res, next) => {
  try {
    const watchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await watchService.confirmSafe(req.user!.uid, watchId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

