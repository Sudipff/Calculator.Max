import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, safeDbQuery } from './db/index';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

export interface StoredEmailUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

const STORE_FILE_PATH = path.join('/tmp', 'retail_calc_email_users.json');

declare global {
  var _inMemoryEmailUsers: Record<string, StoredEmailUser> | undefined;
}

function getMemoryStore(): Record<string, StoredEmailUser> {
  if (!global._inMemoryEmailUsers) {
    global._inMemoryEmailUsers = {};
    try {
      if (fs.existsSync(STORE_FILE_PATH)) {
        const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          global._inMemoryEmailUsers = parsed;
        }
      }
    } catch {
      // Ignore file read errors in restricted environments
    }
  }
  return global._inMemoryEmailUsers;
}

function saveMemoryStore(store: Record<string, StoredEmailUser>) {
  global._inMemoryEmailUsers = store;
  try {
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Ignore file write errors
  }
}

export function generateDeterministicUid(email: string): string {
  const clean = email.trim().toLowerCase();
  const hex = crypto.createHash('sha256').update(`retailcalc:${clean}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPasswordScrypt(password: string, storedHash?: string | null): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) return false;
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const keyHex = parts[2];
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(keyHex, 'hex');
    if (derivedKey.length !== keyBuffer.length) return false;
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

export async function findStoredUserByEmail(email: string): Promise<StoredEmailUser | null> {
  const cleanEmail = email.trim().toLowerCase();
  const store = getMemoryStore();

  // 1. Check PostgreSQL if configured
  const dbRecord = await safeDbQuery(async () => {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);
    return rows[0] || null;
  }, null);

  if (dbRecord && dbRecord.passwordHash) {
    const mapped: StoredEmailUser = {
      uid: dbRecord.uid,
      email: dbRecord.email.toLowerCase(),
      displayName: dbRecord.displayName || cleanEmail.split('@')[0],
      photoURL: dbRecord.photoURL || '',
      passwordHash: dbRecord.passwordHash,
      createdAt: dbRecord.createdAt ? new Date(dbRecord.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: dbRecord.updatedAt ? new Date(dbRecord.updatedAt).toISOString() : new Date().toISOString(),
    };
    store[cleanEmail] = mapped;
    saveMemoryStore(store);
    return mapped;
  }

  // 2. Check memory/file store
  if (store[cleanEmail]) {
    return store[cleanEmail];
  }

  return null;
}

export async function upsertStoredUser(params: {
  email: string;
  password?: string;
  passwordHash?: string;
  displayName?: string;
  uid?: string;
}): Promise<StoredEmailUser> {
  const cleanEmail = params.email.trim().toLowerCase();
  const store = getMemoryStore();
  const existing = store[cleanEmail];

  const finalUid = params.uid || existing?.uid || generateDeterministicUid(cleanEmail);
  const finalName =
    params.displayName?.trim() ||
    existing?.displayName ||
    cleanEmail.split('@')[0] ||
    'Store Retailer';
  const finalHash =
    params.passwordHash ||
    (params.password ? hashPasswordScrypt(params.password) : existing?.passwordHash || '');

  const now = new Date().toISOString();
  const userObj: StoredEmailUser = {
    uid: finalUid,
    email: cleanEmail,
    displayName: finalName,
    photoURL: existing?.photoURL || '',
    passwordHash: finalHash,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  store[cleanEmail] = userObj;
  saveMemoryStore(store);

  // Also persist to PostgreSQL if available
  await safeDbQuery(async () => {
    await db
      .insert(users)
      .values({
        uid: finalUid,
        email: cleanEmail,
        displayName: finalName,
        passwordHash: finalHash,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
          displayName: finalName,
          passwordHash: finalHash,
          updatedAt: new Date(),
        },
      });
  }, null);

  return userObj;
}
