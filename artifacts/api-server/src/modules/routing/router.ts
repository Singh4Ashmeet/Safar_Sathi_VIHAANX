import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { routingService } from './service.js';
import { routeRequestSchema, placeSearchSchema } from './validation.js';

export const routingRouter = Router();

// Routing endpoints require authentication to prevent quota abuse
routingRouter.use(requireAuth);

/**
 * POST /routes
 * FR-16: Route and ETA via OpenRouteService proxy (with cache and straight-line fallback)
 */
routingRouter.post('/', validateBody(routeRequestSchema), async (req, res, next) => {
  try {
    const result = await routingService.getRoute(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /places/search
 * FR-10: Debounced place search through geocoding proxy
 */
routingRouter.get('/places/search', validateQuery(placeSearchSchema), async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    const lat = req.query.lat ? Number(req.query.lat) : undefined;
    const lng = req.query.lng ? Number(req.query.lng) : undefined;
    const result = await routingService.searchPlaces(q, lat, lng);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

