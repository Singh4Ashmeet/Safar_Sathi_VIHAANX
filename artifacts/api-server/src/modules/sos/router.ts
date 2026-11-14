import { Router } from 'express';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { sensitiveUserLimiter } from '../../middleware/rateLimits.js';
import { sosService } from './service.js';
import {
  createSosSchema,
  cancelSosSchema,
  cancelSosParamsSchema,
  acknowledgeSosSchema,
  acknowledgeSosParamsSchema,
  ingestSosLocationsParamsSchema,
  ingestSosLocationsSchema,
  getSosStatusParamsSchema,
} from './validation.js';

export const sosRouter = Router();

/**
 * POST /sos
 * FR-06: Create SOS (client UUID), idempotent
 * Rate limited per-user to prevent abuse while preserving emergency access
 */
sosRouter.post('/', requireAuth, sensitiveUserLimiter, validateBody(createSosSchema), async (req, res, next) => {
  try {
    const result = await sosService.createSos(req.user!.uid, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /sos/:id/locations
 * FR-06: Live location updates during active SOS
 */
sosRouter.post(
  '/:id/locations',
  requireAuth,
  validateParams(ingestSosLocationsParamsSchema),
  validateBody(ingestSosLocationsSchema),
  async (req, res, next) => {
    try {
      const sosId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await sosService.ingestLocations(req.user!.uid, sosId, req.body.points);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /sos/:id/cancel
 * FR-07: Cancel with pinKind: 'cancel' | 'duress'; duress keeps alerting silently
 */
sosRouter.post('/:id/cancel', requireAuth, validateParams(cancelSosParamsSchema), validateBody(cancelSosSchema), async (req, res, next) => {
  try {
    const sosId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await sosService.cancelSos(req.user!.uid, sosId, req.body.pinKind);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /sos/:id/ack
 * FR-08: Guardian acknowledge (by token or auth)
 * - Token path: public (no auth required, token validates access)
 * - Guardian ID path: requires authenticated guardian matching guardianUserId
 */
sosRouter.post('/:id/ack', optionalAuth, validateParams(acknowledgeSosParamsSchema), validateBody(acknowledgeSosSchema), async (req, res, next) => {
  try {
    const sosId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    // Guardian ID path requires authentication; token path is public
    const authenticatedUid = req.body.guardianId ? req.user?.uid : undefined;
    const result = await sosService.acknowledgeSos(sosId, req.body.guardianId, req.body.token, authenticatedUid);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /sos/:id
 * FR-08: Status with per-guardian, per-channel delivery
 */
sosRouter.get(
  '/:id',
  requireAuth,
  validateParams(getSosStatusParamsSchema),
  async (req, res, next) => {
    try {
      const sosId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await sosService.getSosStatus(req.user!.uid, sosId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);