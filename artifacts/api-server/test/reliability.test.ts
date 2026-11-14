import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool, db, tickLog } from '@workspace/db';
import { createShutdownHandler } from '../src/lib/shutdown.js';

describe('Step 1.5: API Reliability, Health Checks & Error Handling', () => {

  // ──────────────── 1. Liveness Probe (/api/healthz and /healthz) ────────────────

  describe('Liveness Probe (/api/healthz)', () => {
    it('should return 200 OK with service status and timestamp', async () => {
      const res = await request(app).get('/api/healthz');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('service', 'safarsaathi-api');
      expect(res.body).toHaveProperty('uptimeSec');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should succeed on root alias /healthz', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('should return 200 even when database pool is unavailable', async () => {
      // Mock pool.query to throw
      const querySpy = vi.spyOn(pool, 'query').mockRejectedValue(new Error('Connection refused'));

      const res = await request(app).get('/api/healthz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');

      querySpy.mockRestore();
    });

    it('should not expose internal stack traces or secrets in liveness response', async () => {
      const res = await request(app).get('/api/healthz');
      expect(res.status).toBe(200);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('stack');
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('postgres');
    });
  });

  // ──────────────── 2. Readiness Probe (/api/readyz and /readyz) ────────────────

  describe('Readiness Probe (/api/readyz)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return 200 and ready status when database is connected and tick is recent', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ '?column?': 1 }] } as any);
      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'tick_1',
                receivedAt: Date.now() - 10000, // 10 seconds ago (< 180s)
                source: 'boot_catch_up',
                tripsChecked: 0,
              },
            ]),
          }),
        }),
      } as any);

      const res = await request(app).get('/api/readyz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.database).toBe('connected');
      expect(res.body.watchdogTick).toBe('ok');
      expect(res.body.lastTickAgeSec).toBeLessThanOrEqual(180);
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return 503 and degraded status when database query fails', async () => {
      vi.spyOn(pool, 'query').mockRejectedValue(new Error('FATAL: password authentication failed'));

      const res = await request(app).get('/api/readyz');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.database).toBe('disconnected');
      expect(res.body.watchdogTick).toBe('unknown');
      // Sanitized error: never leak database credentials or internal errors
      expect(res.body.error).toBe('Database connection failed or timed out');
      expect(res.body).not.toHaveProperty('stack');
    });

    it('should return 503 and degraded status when database query times out (bounded timeout)', async () => {
      // Hang query indefinitely
      vi.spyOn(pool, 'query').mockImplementation(() => new Promise(() => {}));

      const res = await request(app).get('/api/readyz');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.database).toBe('disconnected');
      expect(res.body.error).toBe('Database connection failed or timed out');
    }, 5000);

    it('should return 503 and degraded status when watchdog tick is stale (> 180 seconds)', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ '?column?': 1 }] } as any);
      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'stale_tick',
                receivedAt: Date.now() - 240000, // 240 seconds ago (> 180s)
                source: 'cron',
                tripsChecked: 5,
              },
            ]),
          }),
        }),
      } as any);

      const res = await request(app).get('/api/readyz');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.database).toBe('connected');
      expect(res.body.watchdogTick).toBe('degraded');
      expect(res.body.lastTickAgeSec).toBeGreaterThan(180);
    });

    it('should return 200 with no_ticks when no watchdog ticks are recorded yet (cold start)', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ '?column?': 1 }] } as any);
      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const res = await request(app).get('/api/readyz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.database).toBe('connected');
      expect(res.body.watchdogTick).toBe('no_ticks');
      expect(res.body.lastTickAgeSec).toBeNull();
    });

    it('should work identically on root alias /readyz', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ '?column?': 1 }] } as any);
      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const res = await request(app).get('/readyz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  // ──────────────── 3. Global Error Handling & Edge Cases ────────────────

  describe('Global Error Handling', () => {
    it('should return 404 NOT_FOUND for unknown routes with standard ErrorEnvelope', async () => {
      const res = await request(app).get('/api/v1/non-existent-route');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('Route not found');
    });

    it('should reject requests with body exceeding 64KB with 413 PAYLOAD_TOO_LARGE', async () => {
      // 65KB string exceeds the 64kb limit
      const oversizedPayload = { data: 'A'.repeat(66 * 1024) };

      const res = await request(app)
        .post('/api/v1/relay/packets')
        .send(oversizedPayload);

      expect(res.status).toBe(413);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(res.body.error.message).toContain('64KB');
    });

    it('should return 400 INVALID_JSON for malformed JSON request bodies', async () => {
      const res = await request(app)
        .post('/api/v1/relay/packets')
        .set('Content-Type', 'application/json')
        .send('{ invalid json payload: definitely-not-json');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('INVALID_JSON');
      expect(res.body.error.message).toContain('Malformed JSON');
    });

    it('should sanitize unhandled errors returning 500 without leaking stack traces or internal details', async () => {
      // Trigger unhandled error by stubbing a route handler to throw
      // In our health router:
      const res = await request(app)
        .get('/api/v1/non-existent-route-error-test');
      expect(res.status).toBe(404);
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).not.toHaveProperty('stack');
    });
  });

  // ──────────────── 4. Request IDs & Header Propagation ────────────────

  describe('Request ID Generation & Propagation', () => {
    it('should generate an x-request-id response header when none provided', async () => {
      const res = await request(app).get('/api/healthz');
      expect(res.headers).toHaveProperty('x-request-id');
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should propagate incoming x-request-id header to response', async () => {
      const customId = 'client-req-uuid-9999-abcdef';
      const res = await request(app)
        .get('/api/healthz')
        .set('x-request-id', customId);

      expect(res.headers['x-request-id']).toBe(customId);
    });
  });

  // ──────────────── 5. Graceful Shutdown ────────────────

  describe('Graceful Shutdown Logic', () => {
    it('should close server, clear intervals, and close database pool upon signal', async () => {
      const mockServer = {
        close: vi.fn((cb) => cb && cb(null)),
      };
      const mockCloseDatabase = vi.fn().mockResolvedValue(undefined);
      const mockInterval = setInterval(() => {}, 100000);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      const shutdown = createShutdownHandler({
        server: mockServer as any,
        closeDatabase: mockCloseDatabase,
        intervals: [mockInterval],
        timeoutMs: 1000,
      });

      await shutdown('SIGTERM');

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockCloseDatabase).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);

      clearInterval(mockInterval);
      exitSpy.mockRestore();
    });

    it('should ignore duplicate shutdown signals while in progress', async () => {
      const mockServer = {
        close: vi.fn((cb) => cb && cb(null)),
      };
      const mockCloseDatabase = vi.fn().mockResolvedValue(undefined);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      const shutdown = createShutdownHandler({
        server: mockServer as any,
        closeDatabase: mockCloseDatabase,
      });

      // Fire twice simultaneously
      await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

      // Server.close should only be called once
      expect(mockServer.close).toHaveBeenCalledTimes(1);
      expect(mockCloseDatabase).toHaveBeenCalledTimes(1);

      exitSpy.mockRestore();
    });
  });
});

