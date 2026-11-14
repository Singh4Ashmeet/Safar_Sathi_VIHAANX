import { Router } from 'express';
import { UploadRelayPacketsBody } from '@workspace/api-zod';
import { relayLimiter } from '../../middleware/rateLimits.js';
import { validateBody } from '../../middleware/validate.js';
import { relayService } from './service.js';

export const relayRouter = Router();

/**
 * POST /relay/packets
 * FR-12: Gateway upload: array of base64 packets, idempotent by event ID
 * Uploaded by any internet-connected phone acting as BLE gateway.
 */
relayRouter.post('/packets', relayLimiter, validateBody(UploadRelayPacketsBody), async (req, res, next) => {
  try {
    const results = await relayService.processPackets(req.body.packets);
    res.status(200).json({ results });
  } catch (error) {
    next(error);
  }
});

