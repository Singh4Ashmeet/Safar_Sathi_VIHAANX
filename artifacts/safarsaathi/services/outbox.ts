import * as SQLite from 'expo-sqlite';

export interface OutboxLocationRow {
  id: number;
  trip_id: string;
  lat: number;
  lng: number;
  acc: number | null;
  ts: number;
  mocked: number;
}

export interface OutboxSosRow {
  sos_id: string;
  payload_json: string;
  created_at: number;
  attempts: number;
  next_retry_at: number;
  status: 'queued' | 'sent';
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('safarsaathi_v2.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS location_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trip_id TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          acc REAL,
          ts INTEGER NOT NULL,
          mocked INTEGER NOT NULL DEFAULT 0,
          UNIQUE(trip_id, ts)
        );
        CREATE TABLE IF NOT EXISTS sos_outbox (
          sos_id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_retry_at INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'queued'
        );
        CREATE TABLE IF NOT EXISTS kv_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function enqueueLocationPoint(
  tripId: string,
  point: { lat: number; lng: number; acc?: number; ts: number; mocked?: boolean }
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO location_outbox (trip_id, lat, lng, acc, ts, mocked) VALUES (?, ?, ?, ?, ?, ?)`,
    [tripId, point.lat, point.lng, point.acc ?? null, point.ts, point.mocked ? 1 : 0]
  );
}

export async function readLocationBatch(
  tripId: string,
  limit = 50
): Promise<OutboxLocationRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxLocationRow>(
    `SELECT id, trip_id, lat, lng, acc, ts, mocked FROM location_outbox WHERE trip_id = ? ORDER BY ts ASC LIMIT ?`,
    [tripId, limit]
  );
}

export async function deleteLocationRows(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM location_outbox WHERE id IN (${placeholders})`, ids);
}

export async function countPendingLocationPoints(tripId?: string): Promise<number> {
  const db = await getDb();
  const row = tripId
    ? await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM location_outbox WHERE trip_id = ?`,
        [tripId]
      )
    : await db.getFirstAsync<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM location_outbox`);
  return row?.cnt ?? 0;
}

export async function setActiveTripId(tripId: string | null): Promise<void> {
  const db = await getDb();
  if (tripId === null) {
    await db.runAsync(`DELETE FROM kv_state WHERE key = 'active_trip_id'`);
  } else {
    await db.runAsync(
      `INSERT OR REPLACE INTO kv_state (key, value) VALUES ('active_trip_id', ?)`,
      [tripId]
    );
  }
}

export async function getActiveTripId(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM kv_state WHERE key = 'active_trip_id'`
  );
  return row?.value ?? null;
}

export async function upsertSosOutbox(
  sosId: string,
  payloadJson: string,
  createdAt: number
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO sos_outbox (sos_id, payload_json, created_at, attempts, next_retry_at, status) VALUES (?, ?, ?, 0, 0, 'queued')`,
    [sosId, payloadJson, createdAt]
  );
}

export async function getPendingSosOutbox(nowMs = Date.now()): Promise<OutboxSosRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxSosRow>(
    `SELECT sos_id, payload_json, created_at, attempts, next_retry_at, status FROM sos_outbox WHERE status = 'queued' AND next_retry_at <= ? ORDER BY created_at ASC`,
    [nowMs]
  );
}

export async function markSosOutboxSent(sosId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sos_outbox SET status = 'sent' WHERE sos_id = ?`, [sosId]);
}

export async function bumpSosOutboxRetry(sosId: string, nextRetryAt: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sos_outbox SET attempts = attempts + 1, next_retry_at = ? WHERE sos_id = ?`,
    [nextRetryAt, sosId]
  );
}

