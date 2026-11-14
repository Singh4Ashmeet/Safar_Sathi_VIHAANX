import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db, users } from '@workspace/db';
import { generateBoxKeyPair, generateSignKeyPair } from '@workspace/safety-core';
import { eq } from 'drizzle-orm';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

describe('FR-12: authenticated relay bundle provisioning', () => {
  const userId = `relay_bundle_${Date.now()}`;
  const sign = generateSignKeyPair();
  const box = generateBoxKeyPair();
  const previous = {
    publicKey: env.SERVER_BOX_PUBLIC_KEY,
    secretKey: env.SERVER_BOX_SECRET_KEY,
    destination: env.RELAY_DEST_TAG,
  };

  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      name: 'Bundle User',
      phone: '+919876543210',
      lang: 'en',
      boxPub: box.publicKey,
      signPub: sign.publicKey,
      createdAt: Date.now(),
    });
    env.SERVER_BOX_PUBLIC_KEY = box.publicKey;
    env.SERVER_BOX_SECRET_KEY = box.secretKey;
    env.RELAY_DEST_TAG = '0102030405060708';
  });

  afterAll(async () => {
    env.SERVER_BOX_PUBLIC_KEY = previous.publicKey;
    env.SERVER_BOX_SECRET_KEY = previous.secretKey;
    env.RELAY_DEST_TAG = previous.destination;
    await db.delete(users).where(eq(users.id, userId));
  });

  it('returns only the protocol-defined bundle fields for the authenticated user', async () => {
    const response = await request(app).get('/api/v1/me/relay-bundle').set('x-dev-user-id', userId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      serverBoxPublicKey: box.publicKey,
      destTagForGateway: '0102030405060708',
      ttlStart: 10,
      maxAgeSec: 86_400,
      minAppVersion: '2.0.0',
    });
    expect(response.body).not.toHaveProperty('serverBoxSecretKey');
  });

  it('requires authentication and fails safely when relay configuration is incomplete', async () => {
    const unauthenticated = await request(app).get('/api/v1/me/relay-bundle');
    expect(unauthenticated.status).toBe(401);

    const oldTag = env.RELAY_DEST_TAG;
    env.RELAY_DEST_TAG = '';
    try {
      const response = await request(app).get('/api/v1/me/relay-bundle').set('x-dev-user-id', userId);
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('RELAY_NOT_CONFIGURED');
    } finally {
      env.RELAY_DEST_TAG = oldTag;
    }
  });
});
