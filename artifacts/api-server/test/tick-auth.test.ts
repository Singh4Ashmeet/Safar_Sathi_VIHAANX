import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Internal Watchdog Tick Authentication (TRD T20)', () => {
  it('should reject requests without X-Tick-Secret header with 401', async () => {
    const res = await request(app).post('/internal/tick').send({ source: 'cron' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED_TICK');
  });

  it('should reject requests with invalid X-Tick-Secret header with 401', async () => {
    const res = await request(app)
      .post('/internal/tick')
      .set('x-tick-secret', 'wrong-secret-token')
      .send({ source: 'cron' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED_TICK');
  });

  it('should accept requests with valid X-Tick-Secret and execute watchdog tick (200 OK)', async () => {
    const res = await request(app)
      .post('/internal/tick')
      .set('x-tick-secret', env.TICK_SECRET)
      .send({ source: 'cron' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('source', 'cron');
    expect(res.body).toHaveProperty('tripsChecked');
    expect(res.body).toHaveProperty('escalatedCount');
    expect(res.body).toHaveProperty('timestamp');
  });
});

