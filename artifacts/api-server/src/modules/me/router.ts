import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { sensitiveUserLimiter } from '../../middleware/rateLimits.js';
import { meService } from './service.js';
import { upsertMeSchema } from './validation.js';

export const meRouter = Router();

// All /me endpoints require verified Firebase authentication (FR-01)
meRouter.use(requireAuth);

/**
 * PUT /me
 * FR-01: Upsert profile: name, phone, push token, public keys (box + sign), language
 */
meRouter.put('/', validateBody(upsertMeSchema), async (req, res, next) => {
  try {
    const profile = await meService.upsertProfile(req.user!.uid, req.body);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /me
 * FR-01: Read profile and settings
 */
meRouter.get('/', async (req, res, next) => {
  try {
    const profile = await meService.getProfile(req.user!.uid);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /me
 * FR-14: Delete account and all data
 */
meRouter.delete('/', async (req, res, next) => {
  try {
    const result = await meService.deleteAccount(req.user!.uid);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /me/relay-bundle
 * FR-12: Server public key, epoch tags, TTL policy for offline BLE relay
 * Rate limited per-user to prevent abuse of key provisioning
 */
meRouter.get('/relay-bundle', sensitiveUserLimiter, async (req, res, next) => {
  try {
    const bundle = await meService.getRelayBundle(req.user!.uid);
    res.status(200).json(bundle);
  } catch (err) {
    next(err);
  }
});
