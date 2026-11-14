import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { guardiansService } from './service.js';
import { addGuardianSchema, removeGuardianParamsSchema } from './validation.js';

export const guardiansRouter = Router();

// All /guardians endpoints require verified Firebase auth (FR-02)
guardiansRouter.use(requireAuth);

/**
 * GET /guardians
 * FR-02: List guardians with consent status and channels
 */
guardiansRouter.get('/', async (req, res, next) => {
  try {
    const list = await guardiansService.listGuardians(req.user!.uid);
    res.status(200).json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /guardians
 * FR-02: Add guardian (phone, optional email, preferred channels); sends consent SMS
 */
guardiansRouter.post('/', validateBody(addGuardianSchema), async (req, res, next) => {
  try {
    const result = await guardiansService.addGuardian(req.user!.uid, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /guardians/:id
 * FR-02, FR-14: Remove guardian and revoke all associated share links
 */
guardiansRouter.delete('/:id', validateParams(removeGuardianParamsSchema), async (req, res, next) => {
  try {
    const guardianId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await guardiansService.removeGuardian(req.user!.uid, guardianId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
