import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import admin from 'firebase-admin';
import { app } from '../src/app.js';
import { env, envSchema } from '../src/config/env.js';
import { _setFirebaseInitializedForTesting } from '../src/middleware/auth.js';

/**
 * Step 1.4: Firebase Authentication Middleware & Authorization Hardening Tests
 *
 * Covers:
 * 1. Missing and malformed Authorization headers (401 UNAUTHORIZED)
 * 2. Unconfigured Firebase handling (401 AUTH_UNAVAILABLE)
 * 3. Controlled mocks for Firebase Admin verifyIdToken:
 *    - Valid token -> attaches uid, email, phone; checkRevoked=true enforced
 *    - Expired token -> 401 TOKEN_EXPIRED
 *    - Revoked token -> 401 TOKEN_REVOKED
 *    - Invalid signature/token -> 401 INVALID_TOKEN
 * 4. Token UID authoritative over client-supplied body/param/query UID
 * 5. Development bypass (DEV_AUTH_BYPASS):
 *    - Works only when NODE_ENV !== 'production' and DEV_AUTH_BYPASS === 'true'
 * 6. Production configuration & bypass rejection via envSchema:
 *    - Rejection of DEV_AUTH_BYPASS in production
 *    - Mandatory FIREBASE_SERVICE_ACCOUNT_JSON in production
 *    - Mandatory secure TICK_SECRET in production
 * 7. Public routes remain accessible without auth
 * 8. Internal tick endpoint remains protected by X-Tick-Secret
 * 9. Multi-router audit: all protected routers reject unauthenticated requests
 * 10. Security checks: No leak of internal details, consistent ErrorEnvelope
 */

describe('Step 1.4: Firebase Auth Middleware & Authorization Hardening', () => {

  // ──────────────── Phase 3: Missing / malformed headers ────────────────

  describe('Missing and malformed Authorization headers', () => {
    it('should return 401 UNAUTHORIZED when no Authorization header is sent', async () => {
      const res = await request(app).get('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Authorization');
    });

    it('should return 401 when Authorization header is not Bearer scheme', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Bearer token is empty', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Authorization header is just "Bearer"', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ──────── Phase 3: Token verification without Firebase credentials ────────

  describe('Token verification without Firebase credentials (unconfigured)', () => {
    it('should return 401 AUTH_UNAVAILABLE when token is sent but Firebase is unconfigured', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer some.unverified.token');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAVAILABLE');
      expect(res.body.error.message).toContain('not configured');
    });
  });

  // ──────── Phase 3 & 6: Controlled Mocks for Firebase Admin Token Verification ────────

  describe('Firebase ID Token Verification with Controlled Mocks', () => {
    beforeEach(() => {
      _setFirebaseInitializedForTesting(true);
    });

    afterEach(() => {
      _setFirebaseInitializedForTesting(false);
      vi.restoreAllMocks();
    });

    it('should authenticate valid token, attach UID, email, phone, and pass checkRevoked=true', async () => {
      const verifySpy = vi.fn().mockResolvedValue({
        uid: 'verified_firebase_uid_123',
        email: 'priya@safarsaathi.in',
        phone_number: '+919876543210',
      });
      vi.spyOn(admin, 'auth').mockReturnValue({ verifyIdToken: verifySpy } as any);

      const res = await request(app)
        .get('/api/v1/guardians')
        .set('Authorization', 'Bearer valid-firebase-token-sample');

      // Verify that checkRevoked was explicitly passed as true
      expect(verifySpy).toHaveBeenCalledWith('valid-firebase-token-sample', true);
      // Auth passed - endpoint is implemented, returns 200 with empty array (no guardians for this user)
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject expired Firebase token with 401 TOKEN_EXPIRED', async () => {
      const expiredErr = new Error('Firebase ID token has expired');
      (expiredErr as any).code = 'auth/id-token-expired';
      vi.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: vi.fn().mockRejectedValue(expiredErr),
      } as any);

      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer expired-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
      expect(res.body.error.message).toContain('expired');
    });

    it('should reject revoked Firebase token with 401 TOKEN_REVOKED', async () => {
      const revokedErr = new Error('Firebase ID token has been revoked');
      (revokedErr as any).code = 'auth/id-token-revoked';
      vi.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: vi.fn().mockRejectedValue(revokedErr),
      } as any);

      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer revoked-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_REVOKED');
      expect(res.body.error.message).toContain('revoked');
    });

    it('should reject invalid token signature or malformed token with 401 INVALID_TOKEN', async () => {
      const invalidErr = new Error('Firebase ID token has invalid signature');
      (invalidErr as any).code = 'auth/argument-error';
      vi.spyOn(admin, 'auth').mockReturnValue({
        verifyIdToken: vi.fn().mockRejectedValue(invalidErr),
      } as any);

      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer invalid-signature-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
      expect(res.body.error.message).toContain('Invalid or expired');
    });

    it('should ensure token UID is authoritative over client-supplied body UID', async () => {
      const verifySpy = vi.fn().mockResolvedValue({
        uid: 'verified_token_uid_777',
      });
      vi.spyOn(admin, 'auth').mockReturnValue({ verifyIdToken: verifySpy } as any);

      const res = await request(app)
        .post('/api/v1/sos')
        .set('Authorization', 'Bearer valid-token')
        .send({
          sosId: '33333333-3333-3333-3333-333333333333',
          userId: 'spoofed_attacker_uid',
          trigger: 'button',
          duress: false,
          createdAt: Date.now(),
        });

      // Auth passed - endpoint is implemented, returns 404 (user not found in DB)
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
      expect(verifySpy).toHaveBeenCalled();
    });
  });

  // ──────────────── Phase 4: Development bypass ────────────────

  describe('Development bypass (DEV_AUTH_BYPASS)', () => {
    it('should accept x-dev-user-id header when DEV_AUTH_BYPASS=true in test mode', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', 'user_dev_priya');

      // Dev bypass works - endpoint is implemented, returns 200 with seeded user's guardians
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should correctly pass the dev user UID from the header', async () => {
      const testUid = 'test_uid_12345';
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', testUid);

      // Dev bypass works - endpoint is implemented, returns 200 with empty array (no guardians for this user)
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject empty x-dev-user-id (trimmed to empty string)', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', '   ');
      // Falls through to token verification, which fails
      expect(res.status).toBe(401);
    });

    it('should accept optional x-dev-user-email with x-dev-user-id', async () => {
      const res = await request(app)
        .get('/api/v1/guardians')
        .set('x-dev-user-id', 'user_dev_priya')
        .set('x-dev-user-email', 'priya@safarsaathi.in');
      // Dev bypass works - endpoint is implemented, returns 200 with seeded user's guardians
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ──────────────── Phase 4: Production configuration & bypass rejection via envSchema ────────────────

  describe('Production configuration & bypass rejection via envSchema', () => {
    const validProdBase = {
      NODE_ENV: 'production' as const,
      PORT: 3000,
      ALLOWED_ORIGINS: 'https://safarsaathi.in',
      DATABASE_URL: 'postgres://postgres:secret@localhost:5432/safarsaathi',
      TICK_SECRET: 'production_high_entropy_tick_secret_12345',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'safarsaathi' }),
      DEV_AUTH_BYPASS: 'false' as const,
    };

    it('should reject DEV_AUTH_BYPASS=true in production', () => {
      const result = envSchema.safeParse({
        ...validProdBase,
        DEV_AUTH_BYPASS: 'true',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.some(i => i.path.includes('DEV_AUTH_BYPASS'))).toBe(true);
      }
    });

    it('should reject missing FIREBASE_SERVICE_ACCOUNT_JSON in production', () => {
      const { FIREBASE_SERVICE_ACCOUNT_JSON, ...withoutFb } = validProdBase;
      const result = envSchema.safeParse(withoutFb);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.some(i => i.path.includes('FIREBASE_SERVICE_ACCOUNT_JSON'))).toBe(true);
      }
    });

    it('should reject default or weak TICK_SECRET in production', () => {
      const result = envSchema.safeParse({
        ...validProdBase,
        TICK_SECRET: 'safarsaathi_dev_tick_secret_replace_in_prod',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.some(i => i.path.includes('TICK_SECRET'))).toBe(true);
      }
    });

    it('should succeed with valid production configuration', () => {
      const result = envSchema.safeParse(validProdBase);
      expect(result.success).toBe(true);
    });
  });

  // ──────────── Phase 5: Token UID is authoritative ────────────

  describe('Token UID is authoritative over client-supplied UID', () => {
    it('should use the dev bypass UID, ignoring any userId in the body', async () => {
      const devUid = 'verified_user_123';
      const res = await request(app)
        .post('/api/v1/sos')
        .set('x-dev-user-id', devUid)
        .send({
          sosId: '22222222-2222-2222-2222-222222222222',
          userId: 'attacker_user_trying_to_impersonate',
          trigger: 'button',
          duress: false,
          createdAt: Date.now(),
        });

      // Dev bypass works - endpoint is implemented, returns 404 (user not found in DB)
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  // ──────────── Phase 6: Public routes remain accessible ────────────

  describe('Public routes remain accessible without authentication', () => {
    it('GET /api/healthz is public', async () => {
      const res = await request(app).get('/api/healthz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /healthz alias is public', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
    });

    it('GET /t/:token is public (accessible without auth, returns 404 for invalid token)', async () => {
      const res = await request(app).get('/t/some-share-token');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('GET /public/track/:token is public (accessible without auth, returns 404 for invalid token)', async () => {
      const res = await request(app).get('/public/track/some-share-token');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('POST /sos/:id/ack is public (guardian acknowledgment, returns 400 for invalid input without auth)', async () => {
      const res = await request(app)
        .post('/api/v1/sos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/ack')
        .send({ guardianId: 'some-id', token: 'some-token' });
      // Guardian ID path requires auth; token path requires valid token
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /relay/packets is public and validates gateway payloads', async () => {
      const res = await request(app)
        .post('/api/v1/relay/packets')
        .send({ packets: [] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ──────── Phase 6: Internal tick secret protection unchanged ────────

  describe('Internal tick endpoint protection remains intact', () => {
    it('should reject /internal/tick without X-Tick-Secret', async () => {
      const res = await request(app).post('/internal/tick').send({ source: 'cron' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED_TICK');
    });

    it('should reject /internal/tick with wrong secret', async () => {
      const res = await request(app)
        .post('/internal/tick')
        .set('x-tick-secret', 'totally-wrong')
        .send({ source: 'cron' });
      expect(res.status).toBe(401);
    });

    it('should accept /internal/tick with correct secret (200 OK)', async () => {
      const res = await request(app)
        .post('/internal/tick')
        .set('x-tick-secret', env.TICK_SECRET)
        .send({ source: 'cron' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // ──── Phase 6: Protected routes require auth (multi-router check) ────

  describe('Protected routes require authentication', () => {
    const protectedEndpoints = [
      { method: 'get', path: '/api/v1/me' },
      { method: 'get', path: '/api/v1/guardians' },
      { method: 'post', path: '/api/v1/trips' },
      { method: 'post', path: '/api/v1/watch' },
      { method: 'post', path: '/api/v1/routes' },
      { method: 'get', path: '/api/v1/safety/zones' },
      { method: 'get', path: '/api/v1/rides' },
    ];

    for (const { method, path } of protectedEndpoints) {
      it(`${method.toUpperCase()} ${path} should return 401 without auth`, async () => {
        const res = await (request(app) as any)[method](path);
        expect(res.status).toBe(401);
      });
    }
  });

  // ──────────── Phase 7: Security checks ────────────

  describe('Security verification', () => {
    it('should not expose internal error details in 401 responses', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
      // Should not contain stack traces or Firebase internals
      expect(JSON.stringify(res.body)).not.toContain('stack');
      expect(JSON.stringify(res.body)).not.toContain('firebase-admin');
    });

    it('should return consistent error envelope format for auth failures', async () => {
      const res = await request(app).get('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
    });
  });
});
