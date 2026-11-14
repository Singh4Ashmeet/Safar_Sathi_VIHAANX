import { Router } from 'express';
import { meRouter } from './modules/me/router.js';
import { guardiansRouter } from './modules/guardians/router.js';
import { tripsRouter } from './modules/trips/router.js';
import { sosRouter } from './modules/sos/router.js';
import { watchRouter } from './modules/watch/router.js';
import { relayRouter } from './modules/relay/router.js';
import { routingRouter } from './modules/routing/router.js';
import { safetyRouter } from './modules/safety/router.js';
import { ridesRouter } from './modules/rides/router.js';
import { publicRouter } from './modules/public/router.js';
import { internalRouter } from './modules/internal/router.js';
import { telegramWebhookRouter } from './modules/integrations/telegramWebhook.js';
import { healthRouter } from './modules/health/router.js';

export function setupRoutes(app: Router): void {
  // 1. Endpoints outside /api/v1 (TRD section 9.1)
  // Health probes
  app.use('/api', healthRouter);
  app.use('/', healthRouter); // alias /healthz, /readyz

  // Public guardian tracking page & JSON polling
  app.use('/', publicRouter);

  // Internal tickers (/internal/tick)
  app.use('/internal', internalRouter);

  // Third-party webhooks (/integrations/telegram/webhook)
  app.use('/integrations', telegramWebhookRouter);

  // 2. Base path /api/v1 - Authenticated API endpoints
  const v1Router = Router();

  v1Router.use('/me', meRouter);
  v1Router.use('/guardians', guardiansRouter);
  v1Router.use('/trips', tripsRouter);
  v1Router.use('/sos', sosRouter);
  v1Router.use('/watch', watchRouter);
  v1Router.use('/relay', relayRouter);
  v1Router.use('/routes', routingRouter);
  v1Router.use('/places', routingRouter);
  v1Router.use('/safety', safetyRouter);
  v1Router.use('/rides', ridesRouter);

  app.use('/api/v1', v1Router);
}

