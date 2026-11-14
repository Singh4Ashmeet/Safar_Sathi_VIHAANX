import type { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  phone?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Optional authentication middleware.
 * Attempts to authenticate the request but allows it to proceed even if authentication fails.
 * Attaches `req.user` if authentication succeeds, leaves it undefined if not.
 * Used for endpoints that support both authenticated and public access (e.g., token-based acknowledgement).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // 1. Dev-only auth bypass (strictly disabled in production, requires explicit opt-in)
  if (isDevBypassEnabled()) {
    const devUserId = req.headers['x-dev-user-id'];
    if (typeof devUserId === 'string' && devUserId.trim().length > 0) {
      const uid = devUserId.trim();
      if (uid.toLowerCase().startsWith('system_')) {
        return next(); // Don't attach user, let it proceed unauthenticated
      }
      req.user = {
        uid: uid,
        email: typeof req.headers['x-dev-user-email'] === 'string'
          ? req.headers['x-dev-user-email']
          : undefined,
      };
      return next();
    }
  }

  // 2. Extract Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // No auth header, proceed unauthenticated
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next(); // Empty token, proceed unauthenticated
  }

  // 3. Verify through Firebase Admin
  try {
    if (!firebaseInitialized) {
      return next(); // Firebase not configured, proceed unauthenticated
    }

    const decoded = await admin.auth().verifyIdToken(token, /* checkRevoked */ true);
    if (decoded.uid.toLowerCase().startsWith('system_')) {
      return next(); // System identity, proceed unauthenticated
    }
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      phone: decoded.phone_number,
    };
    return next();
  } catch (error: unknown) {
    // Ignore authentication errors, proceed unauthenticated
    return next();
  }
}

// --- Firebase Admin singleton initialization ---

let firebaseInitialized = false;

function initFirebase(): void {
  if (firebaseInitialized) return;

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      logger.info('Firebase Admin SDK initialized');
    } catch (err) {
      logger.error({ err }, 'Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON');
      // Do NOT set firebaseInitialized — auth calls will reject cleanly
    }
  } else if (env.NODE_ENV === 'production') {
    // Production MUST have Firebase configured (env.ts superRefine should
    // have already caught this, but be defensive)
    logger.error('FIREBASE_SERVICE_ACCOUNT_JSON is missing in production');
  } else {
    logger.warn('Firebase service account not configured; running in dev/test mode');
  }
}

initFirebase();

// --- Exported helpers for testing ---

/** Returns whether Firebase Admin has been initialised. */
export function isFirebaseInitialized(): boolean {
  return firebaseInitialized;
}

/** For testing purposes: allows mocking initialized state. */
export function _setFirebaseInitializedForTesting(val: boolean): void {
  firebaseInitialized = val;
}

export interface FirebaseCleanupResult {
  success: boolean;
  action: 'deleted' | 'disabled' | 'skipped' | 'failed';
}

/**
 * Attempts Firebase Admin user deletion after database account deletion.
 *
 * Sequence:
 * 1. If Firebase is not initialized (dev/test mode), skips safely.
 * 2. Attempts admin.auth().deleteUser(userId) with up to 3 bounded retries.
 * 3. Treats 'auth/user-not-found' as successful cleanup.
 * 4. If deletion fails, attempts fallback: admin.auth().updateUser(userId, { disabled: true }).
 * 5. Logs structured error if both fail, but never throws or recreates the DB profile.
 */
export async function cleanupFirebaseUser(userId: string): Promise<FirebaseCleanupResult> {
  if (!isFirebaseInitialized()) {
    logger.info({ userId }, '[Auth] Firebase Admin not initialized; skipping Firebase user cleanup');
    return { success: true, action: 'skipped' };
  }

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await admin.auth().deleteUser(userId);
      logger.info({ userId }, '[Auth] Successfully deleted Firebase user');
      return { success: true, action: 'deleted' };
    } catch (err: any) {
      lastErr = err;
      if (err?.code === 'auth/user-not-found') {
        logger.info({ userId }, '[Auth] Firebase user already removed (user-not-found)');
        return { success: true, action: 'deleted' };
      }
      logger.warn({ userId, attempt, err: err?.message }, '[Auth] Transient error deleting Firebase user; retrying');
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 100));
      }
    }
  }

  // Deletion failed after 3 attempts -> attempt fallback disable
  try {
    await admin.auth().updateUser(userId, { disabled: true });
    logger.warn({ userId }, '[Auth] Failed to delete Firebase user; successfully disabled user as fallback');
    return { success: true, action: 'disabled' };
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      return { success: true, action: 'deleted' };
    }
    logger.error(
      { userId, lastErr, disableErr: err },
      '[Auth] CRITICAL: Failed to delete AND disable Firebase user after DB account deletion'
    );
    return { success: false, action: 'failed' };
  }
}

// --- Dev bypass gate ---

/**
 * Returns true ONLY when ALL of:
 *  1. NODE_ENV is NOT 'production'
 *  2. DEV_AUTH_BYPASS is explicitly set to 'true'
 */
function isDevBypassEnabled(): boolean {
  return env.NODE_ENV !== 'production' && env.DEV_AUTH_BYPASS === 'true';
}

// --- Authentication middleware ---

/**
 * Verifies a Firebase ID token from the `Authorization: Bearer <token>` header
 * and attaches `req.user` with the verified UID.
 *
 * In non-production environments, a development bypass header `x-dev-user-id`
 * is accepted ONLY when `DEV_AUTH_BYPASS=true` is explicitly configured.
 *
 * The verified token UID is always authoritative — a client-supplied UID in the
 * request body or query is never used for identity.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // 1. Dev-only auth bypass (strictly disabled in production, requires explicit opt-in)
  if (isDevBypassEnabled()) {
    const devUserId = req.headers['x-dev-user-id'];
    if (typeof devUserId === 'string' && devUserId.trim().length > 0) {
      const uid = devUserId.trim();
      if (uid.toLowerCase().startsWith('system_')) {
        return next(new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot be used for user authentication'));
      }
      req.user = {
        uid,
        email: typeof req.headers['x-dev-user-email'] === 'string'
          ? req.headers['x-dev-user-email']
          : undefined,
      };
      return next();
    }
  }

  // 2. Extract Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header'));
  }

  const token = authHeader.slice(7).trim();   // 'Bearer '.length === 7
  if (!token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing Bearer token'));
  }

  // 3. Verify through Firebase Admin
  try {
    if (!firebaseInitialized) {
      return next(new AppError(401, 'AUTH_UNAVAILABLE', 'Authentication service is not configured'));
    }

    // checkRevoked: true ensures revoked tokens are rejected
    const decoded = await admin.auth().verifyIdToken(token, /* checkRevoked */ true);
    if (decoded.uid.toLowerCase().startsWith('system_')) {
      return next(new AppError(403, 'FORBIDDEN', 'Reserved system identities cannot be used for user authentication'));
    }
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      phone: decoded.phone_number,
    };
    return next();
  } catch (error: unknown) {
    // Map Firebase error codes to consistent 401 responses
    // without leaking internal error details to the client
    const fbCode = error instanceof Error && 'code' in error
      ? (error as { code: string }).code
      : undefined;

    if (fbCode === 'auth/id-token-revoked') {
      logger.warn('Rejected revoked Firebase token');
      return next(new AppError(401, 'TOKEN_REVOKED', 'Authentication token has been revoked'));
    }

    if (fbCode === 'auth/id-token-expired') {
      logger.warn('Rejected expired Firebase token');
      return next(new AppError(401, 'TOKEN_EXPIRED', 'Authentication token has expired'));
    }

    // All other verification failures (invalid signature, malformed, etc.)
    logger.warn({ fbCode }, 'Failed to verify Firebase token');
    return next(new AppError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token'));
  }
}
