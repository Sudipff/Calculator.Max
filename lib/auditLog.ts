import { desc, eq } from 'drizzle-orm';
import { db, safeDbQuery } from './db/index';
import { securityAuditLogs } from './db/schema';
import { sanitizePlainText } from './validation';

export interface SecurityAuditEntry {
  id?: number;
  userUid: string | null;
  actorRole: string;
  action: string;
  resource: string;
  status: 'success' | 'denied' | 'error';
  ipAddress: string;
  details: string;
  createdAt: string;
}

declare global {
  var _securityAuditRingBuffer: SecurityAuditEntry[] | undefined;
}

function getAuditBuffer(): SecurityAuditEntry[] {
  if (!global._securityAuditRingBuffer) {
    global._securityAuditRingBuffer = [];
  }
  return global._securityAuditRingBuffer;
}

export async function logSecurityEvent(entry: Omit<SecurityAuditEntry, 'createdAt'>): Promise<void> {
  const safeEntry: SecurityAuditEntry = {
    userUid: entry.userUid ? sanitizePlainText(entry.userUid, 128) : null,
    actorRole: sanitizePlainText(entry.actorRole || 'anonymous', 32),
    action: sanitizePlainText(entry.action, 80),
    resource: sanitizePlainText(entry.resource, 80),
    status: entry.status,
    ipAddress: sanitizePlainText(entry.ipAddress || 'unknown', 64),
    details: sanitizePlainText(entry.details, 400),
    createdAt: new Date().toISOString(),
  };

  const buffer = getAuditBuffer();
  buffer.unshift(safeEntry);
  if (buffer.length > 200) {
    buffer.length = 200;
  }

  await safeDbQuery(async () => {
    await db.insert(securityAuditLogs).values({
      userUid: safeEntry.userUid,
      actorRole: safeEntry.actorRole,
      action: safeEntry.action,
      resource: safeEntry.resource,
      status: safeEntry.status,
      ipAddress: safeEntry.ipAddress,
      details: safeEntry.details,
    });
  }, undefined);
}

export async function getSecurityAuditLogs(options: {
  userUid?: string;
  isAdmin?: boolean;
  limit?: number;
}): Promise<SecurityAuditEntry[]> {
  const safeLimit = Math.min(Math.max(options.limit || 50, 1), 200);

  const dbLogs = await safeDbQuery(async () => {
    if (options.isAdmin) {
      return await db
        .select()
        .from(securityAuditLogs)
        .orderBy(desc(securityAuditLogs.createdAt))
        .limit(safeLimit);
    }
    if (!options.userUid) return [];
    return await db
      .select()
      .from(securityAuditLogs)
      .where(eq(securityAuditLogs.userUid, options.userUid))
      .orderBy(desc(securityAuditLogs.createdAt))
      .limit(safeLimit);
  }, null as any);

  if (Array.isArray(dbLogs) && dbLogs.length > 0) {
    return dbLogs.map((row: any) => ({
      id: row.id,
      userUid: row.userUid,
      actorRole: row.actorRole,
      action: row.action,
      resource: row.resource,
      status: row.status,
      ipAddress: row.ipAddress || 'unknown',
      details: row.details || '',
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  const buffer = getAuditBuffer();
  const filtered = options.isAdmin
    ? buffer
    : buffer.filter((e) => e.userUid && e.userUid === options.userUid);
  return filtered.slice(0, safeLimit);
}
