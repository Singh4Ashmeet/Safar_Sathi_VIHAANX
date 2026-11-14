import * as dotenv from 'dotenv';
dotenv.config();
import { db } from './client.js';
import { users, guardians, zones, SYSTEM_TOMBSTONE_USER_ID, SYSTEM_TOMBSTONE_GUARDIAN_ID } from './schema/index.js';
import { pool } from './client.js';

/**
 * Deterministic Demo Database Seeding Script (FR-01, FR-02, FR-10, TRD 8.6)
 * Idempotent: safe to run multiple times without duplicating or corrupting data.
 * All synthetic records are clearly labelled as (Demo).
 * NO real personal phone numbers or actual emergencies are created.
 */
export async function seed(): Promise<void> {
  console.log('[Seed] Starting idempotent database seed...');
  const now = Date.now();

  // 0. Seed System Tombstone Sentinel Records (Required for safe DPDP erasure & retention)
  const tombstoneUser = {
    id: SYSTEM_TOMBSTONE_USER_ID,
    name: '[DELETED USER]',
    phone: '+000000000000',
    lang: 'en',
    boxPub: 'DELETED_KEY',
    signPub: 'DELETED_KEY',
    expoPushToken: null,
    adultConfirmedAt: null,
    createdAt: 0,
  };
  await db.insert(users).values(tombstoneUser).onConflictDoNothing({ target: users.id });

  const tombstoneGuardian = {
    id: SYSTEM_TOMBSTONE_GUARDIAN_ID,
    userId: SYSTEM_TOMBSTONE_USER_ID,
    name: '[DELETED GUARDIAN]',
    phoneE164: '+000000000000',
    email: null,
    relationship: 'anonymized',
    channels: ['sms'],
    telegramChatId: null,
    consentStatus: 'revoked' as const,
    guardianUserId: null,
    createdAt: 0,
  };
  await db.insert(guardians).values(tombstoneGuardian).onConflictDoNothing({ target: guardians.id });
  console.log('[Seed] Seeded system tombstone sentinel records (idempotent)');

  // 1. Seed Demo Primary User (Priya Sharma)
  const demoUsers = [
    {
      id: 'user_dev_priya',
      name: 'Priya Sharma (Demo)',
      phone: '+919876543210',
      lang: 'en',
      boxPub: 'dGVzdF9ib3hfcHVibGljX2tleV9kZW1vX3ByaXlhXzEyMw==',
      signPub: 'dGVzdF9zaWduX3B1YmxpY19rZXlfZGVtb19wcml5YV8xMjM=',
      expoPushToken: 'ExponentPushToken[demo_priya_push_token]',
      adultConfirmedAt: now,
      createdAt: now,
    },
    {
      id: 'user_dev_attacker',
      name: 'Test Isolation User (Demo)',
      phone: '+919876543299',
      lang: 'en',
      boxPub: 'dGVzdF9ib3hfcHVibGljX2tleV9kZW1vX2F0dGFja2VyXzEy',
      signPub: 'dGVzdF9zaWduX3B1YmxpY19rZXlfZGVtb19hdHRhY2tlcl8xMg==',
      expoPushToken: null,
      adultConfirmedAt: now,
      createdAt: now,
    },
  ];

  for (const u of demoUsers) {
    await db.insert(users).values(u).onConflictDoNothing({ target: users.id });
  }
  console.log(`[Seed] Seeded ${demoUsers.length} demo users (idempotent)`);

  // 2. Seed Demo Guardians for Priya
  const demoGuardians = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      userId: 'user_dev_priya',
      name: 'Amit Sharma (Spouse - Demo)',
      phoneE164: '+919876543211',
      email: 'amit.demo@safarsaathi.local',
      relationship: 'spouse',
      channels: ['sms', 'telegram'],
      telegramChatId: 'demo_chat_amit',
      consentStatus: 'granted',
      guardianUserId: null,
      createdAt: now,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      userId: 'user_dev_priya',
      name: 'Sunita Sharma (Parent - Demo)',
      phoneE164: '+919876543212',
      email: null,
      relationship: 'parent',
      channels: ['sms'],
      telegramChatId: null,
      consentStatus: 'granted',
      guardianUserId: null,
      createdAt: now,
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      userId: 'user_dev_priya',
      name: 'Rohan Verma (Friend - Demo)',
      phoneE164: '+919876543213',
      email: 'rohan.demo@safarsaathi.local',
      relationship: 'friend',
      channels: ['sms', 'email'],
      telegramChatId: null,
      consentStatus: 'pending',
      guardianUserId: null,
      createdAt: now,
    },
  ];

  for (const g of demoGuardians) {
    await db.insert(guardians).values(g).onConflictDoNothing({ target: guardians.id });
  }
  console.log(`[Seed] Seeded ${demoGuardians.length} demo guardians (idempotent)`);

  // 3. Seed Representative Safety Zones (Delhi NCR)
  const demoZones = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      lat: 28.6315,
      lng: 77.2167,
      radiusM: 500.0,
      category: 'commercial_hub',
      severity: 'low',
      source: 'seed',
      updatedAt: now,
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      lat: 28.5494,
      lng: 77.1956,
      radiusM: 400.0,
      category: 'nightlife_transit',
      severity: 'medium',
      source: 'seed',
      updatedAt: now,
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      lat: 28.7041,
      lng: 77.1025,
      radiusM: 600.0,
      category: 'poor_lighting_isolated',
      severity: 'high',
      source: 'seed',
      updatedAt: now,
    },
  ];

  for (const z of demoZones) {
    await db.insert(zones).values(z).onConflictDoNothing({ target: zones.id });
  }
  console.log(`[Seed] Seeded ${demoZones.length} demo safety zones (idempotent)`);

  console.log('[Seed] Database seeding completed successfully.');
}

if (process.env.NODE_ENV !== 'test') {
  seed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed] Error seeding database:', err);
      await pool.end();
      process.exit(1);
    });
}
