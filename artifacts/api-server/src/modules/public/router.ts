import { Router } from 'express';
import { notImplemented } from '../../lib/errors.js';
import { publicService } from './service.js';
import { publicTrackingLimiter } from '../../middleware/rateLimits.js';

export const publicRouter = Router();

function getTokenParam(req: any): string {
  const token = req.params.token;
  return Array.isArray(token) ? token[0] : token;
}

/**
 * GET /t/:token
 * FR-04, FR-07: Public HTML tracking page for guardians (Leaflet + OSM)
 * Rate limited per-IP to prevent enumeration/abuse
 */
publicRouter.get('/t/:token', publicTrackingLimiter, async (req, res, next) => {
  try {
    const token = getTokenParam(req);
    const tracking = await publicService.getTrackingByToken(token);
    if (tracking.isExpired) {
      // Render expired page
      res.send(renderExpiredPage());
      return;
    }
    // Render tracking page
    res.send(renderTrackingPage({
      userName: tracking.userName,
      tripStatus: tracking.tripStatus,
      lastLat: tracking.lastLat,
      lastLng: tracking.lastLng,
      lastSeenAt: tracking.lastSeenAt,
      isExpired: tracking.isExpired,
      token,
      ridePlate: tracking.ridePlate,
      rideDriver: tracking.rideDriver,
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /public/track/:token
 * FR-04, FR-07: Public JSON endpoint for live polling
 * Rate limited per-IP to prevent enumeration/abuse
 */
publicRouter.get('/public/track/:token', publicTrackingLimiter, async (req, res, next) => {
  try {
    const token = getTokenParam(req);
    const tracking = await publicService.getTrackingByToken(token);
    res.json({
      userName: tracking.userName,
      tripStatus: tracking.tripStatus,
      lastLat: tracking.lastLat,
      lastLng: tracking.lastLng,
      lastSeenAt: tracking.lastSeenAt,
      isExpired: tracking.isExpired,
    });
  } catch (err) {
    next(err);
  }
});

import { renderTrackingPage, renderExpiredPage } from './trackingPage.js';
import { trackingBroadcaster } from './liveTracking.js';

/**
 * GET /public/track/:token/stream
 * Real-time Server-Sent Events (SSE) stream for guardian live tracking.
 * Provides instant (<100ms) location broadcast whenever client ingests a coordinate fix.
 */
publicRouter.get('/public/track/:token/stream', async (req, res, next) => {
  try {
    const token = getTokenParam(req);
    const tracking = await publicService.getTrackingByToken(token);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send initial state
    res.write(`data: ${JSON.stringify(tracking)}\n\n`);

    if (tracking.isExpired || !tracking.targetId) {
      res.end();
      return;
    }

    const targetId = tracking.targetId;
    const unsubscribe = trackingBroadcaster.subscribe(targetId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.isExpired) {
        res.end();
      }
    });

    // 15s keep-alive ping
    const pingInterval = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(pingInterval);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(pingInterval);
      unsubscribe();
    });
  } catch (err) {
    next(err);
  }
});
