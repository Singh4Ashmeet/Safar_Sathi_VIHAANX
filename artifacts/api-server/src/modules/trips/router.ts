import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { tripsService } from './service.js';
import { createTripSchema, ingestLocationsSchema, tripIdParamsSchema, endTripParamsSchema } from './validation.js';

export const tripsRouter = Router();

// All /trips endpoints require verified Firebase auth (FR-03)
tripsRouter.use(requireAuth);

/**
 * POST /trips
 * FR-03: Create trip (client UUID) with destination, route polyline, ETA
 */
tripsRouter.post('/', validateBody(createTripSchema), async (req, res, next) => {
  try {
    const result = await tripsService.createTrip(req.user!.uid, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /trips/:id/locations
 * FR-03: Batch location ingest (idempotent by ts)
 */
tripsRouter.post('/:id/locations', validateParams(tripIdParamsSchema), validateBody(ingestLocationsSchema), async (req, res, next) => {
  try {
    const tripId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await tripsService.ingestLocations(req.user!.uid, tripId, req.body.points);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /trips/:id/end
 * FR-03: End trip safely
 */
tripsRouter.post('/:id/end', validateParams(tripIdParamsSchema), async (req, res, next) => {
  try {
    const tripId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await tripsService.endTrip(req.user!.uid, tripId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /trips/:id/share
 * FR-04: Create expiring share link
 */
tripsRouter.post('/:id/share', async (req, res, next) => {
  try {
    const tripId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await tripsService.createShareLink(req.user!.uid, tripId, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /trips/:id/share
 * FR-04, FR-14: Revoke share link
 */
tripsRouter.delete('/:id/share', async (req, res, next) => {
  try {
    const tripId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const guardianId = req.query.guardianId as string | undefined;
    const result = await tripsService.revokeShareLink(req.user!.uid, tripId, guardianId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});