import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  var _postgresPool: Pool | undefined;
  var _drizzleDb: any | undefined;
  var _postgresDisabled: boolean | undefined;
}

export const getPool = (): Pool | null => {
  if (global._postgresDisabled) {
    return null;
  }

  // Only attempt pool creation if a host or database URL is configured
  if (!process.env.SQL_HOST && !process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    return null;
  }

  if (!global._postgresPool) {
    try {
      const host = process.env.SQL_HOST || 'localhost';
      const user = process.env.SQL_USER || process.env.SQL_ADMIN_USER || 'postgres';
      const password = process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || '';
      const database = process.env.SQL_DB_NAME || 'postgres';

      global._postgresPool = new Pool({
        host,
        user,
        password,
        database,
        max: 3,
        connectionTimeoutMillis: 1500,
        idleTimeoutMillis: 5000,
      });

      global._postgresPool.on('error', (err) => {
        // Suppress unhandled connection resets and mark disabled for transient period
        console.warn('PostgreSQL connection notice (non-fatal):', err.message);
      });
    } catch (err) {
      console.warn('Failed to initialize PostgreSQL pool:', err);
      return null;
    }
  }
  return global._postgresPool;
};

export const getDb = () => {
  if (global._postgresDisabled) return null;
  if (!global._drizzleDb) {
    const pool = getPool();
    if (!pool) return null;
    global._drizzleDb = drizzle(pool, { schema });
  }
  return global._drizzleDb;
};

export async function safeDbQuery<T>(queryFn: () => Promise<T>, fallback: T): Promise<T> {
  if (global._postgresDisabled) return fallback;
  try {
    const pool = getPool();
    if (!pool) return fallback;

    // Timeout safety wrapper (max 1500ms for SQL operations)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SQL_TIMEOUT')), 1500)
    );

    return await Promise.race([queryFn(), timeoutPromise]);
  } catch (err: any) {
    if (err?.message === 'SQL_TIMEOUT' || err?.message?.includes('timeout') || err?.message?.includes('Connection terminated')) {
      // Temporarily bypass unresponsive SQL pool to prevent cascading lag
      global._postgresDisabled = true;
      setTimeout(() => {
        global._postgresDisabled = false;
      }, 30000);
    }
    return fallback;
  }
}

// Safe lazy proxy for backward compatibility without crashing on module load
export const db = new Proxy({} as any, {
  get(_target, prop) {
    const instance = getDb();
    if (!instance) {
      throw new Error('Database is not configured (SQL_HOST or DATABASE_URL missing).');
    }
    return (instance as any)[prop];
  },
});


