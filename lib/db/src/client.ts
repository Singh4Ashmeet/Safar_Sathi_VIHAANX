import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

dotenv.config();

const { Pool } = pg;

const isSupabase = Boolean(process.env.DATABASE_URL?.includes('supabase'));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/safarsaathi',
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  // Free tier connection pool limits
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });

export * from './schema/index.js';
export { schema };

