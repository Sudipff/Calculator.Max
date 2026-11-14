import { db, safeDbQuery } from './index';
import { users, calculations, securityAuditLogs } from './schema';
import { eq, desc, and } from 'drizzle-orm';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { encryptText, decryptText } from '../encryption';
import { deleteStoredUserByEmailOrUid } from '../emailAuthStore';

export async function getOrCreateUser(uid: string, email: string, displayName?: string, photoURL?: string) {
  return await safeDbQuery(async () => {
    const result = await db
      .insert(users)
      .values({
        uid,
        email: email || '',
        displayName: displayName || '',
        photoURL: photoURL || '',
        role: 'user',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: email || '',
          displayName: displayName || '',
          photoURL: photoURL || '',
          updatedAt: new Date(),
        },
      })
      .returning({
        id: users.id,
        uid: users.uid,
        email: users.email,
        displayName: users.displayName,
        photoURL: users.photoURL,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });
    return result[0];
  }, { uid, email, displayName, photoURL, role: 'user' });
}

export async function updateUserPassword(uid: string, passwordHash: string, email?: string) {
  return await safeDbQuery(async () => {
    const result = await db
      .insert(users)
      .values({
        uid,
        email: email || '',
        passwordHash,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          passwordHash,
          updatedAt: new Date(),
          ...(email ? { email } : {}),
        },
      })
      .returning({ uid: users.uid, updatedAt: users.updatedAt });
    return result[0];
  }, { uid, updated: true });
}

export async function saveUserCalculation(
  uid: string,
  type: string,
  details: string,
  result: string,
  userToken?: string
) {
  try {
    // 1. Supabase table (protected by TLS in transit, Supabase AES-256 disk encryption at rest, & RLS)
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const clientOptions = userToken
          ? { global: { headers: { Authorization: `Bearer ${userToken}` } } }
          : undefined;
        const supabase = createClient(supabaseUrl, supabaseKey, clientOptions);

        const { data, error } = await supabase
          .from('calculations')
          .insert({ user_id: uid, type, details, result })
          .select()
          .single();

        if (!error && data) {
          return {
            id: data.id,
            userId: uid,
            type: data.type,
            details: data.details,
            result: data.result,
            createdAt: data.created_at || new Date(),
          };
        }
      } catch {
        // Fallback gracefully to PostgreSQL
      }
    }

    // 2. Parameterized Drizzle SQL persistence with AES-256-GCM field-level encryption at rest
    const encryptedDetails = encryptText(details);
    const encryptedResult = encryptText(result);

    return await safeDbQuery(async () => {
      const userRecords = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      let userId: number;
      if (userRecords.length === 0) {
        const newUser = await db.insert(users).values({ uid, email: '', role: 'user' }).returning();
        userId = newUser[0].id;
      } else {
        userId = userRecords[0].id;
      }

      const inserted = await db
        .insert(calculations)
        .values({
          userId,
          type,
          details: encryptedDetails,
          result: encryptedResult,
        })
        .returning();

      return {
        ...inserted[0],
        details: decryptText(inserted[0].details),
        result: decryptText(inserted[0].result),
      };
    }, {
      id: Date.now(),
      userId: uid,
      type,
      details,
      result,
      createdAt: new Date(),
    });
  } catch {
    return {
      id: Date.now(),
      userId: uid,
      type,
      details,
      result,
      createdAt: new Date(),
    };
  }
}

export async function getUserCalculations(uid: string, userToken?: string) {
  try {
    // 1. Try Supabase first
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const clientOptions = userToken
          ? { global: { headers: { Authorization: `Bearer ${userToken}` } } }
          : undefined;
        const supabase = createClient(supabaseUrl, supabaseKey, clientOptions);

        const { data, error } = await supabase
          .from('calculations')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          return data.map((d: any) => ({
            id: d.id,
            type: d.type,
            details: decryptText(d.details),
            result: decryptText(d.result),
            createdAt: d.created_at,
          }));
        }
      } catch {
        // Continue to SQL fallback if Supabase errored
      }
    }

    // 2. Parameterized Drizzle SQL query + transparent AES-256-GCM decryption
    return await safeDbQuery(async () => {
      const rows = await db
        .select({
          id: calculations.id,
          type: calculations.type,
          details: calculations.details,
          result: calculations.result,
          createdAt: calculations.createdAt,
        })
        .from(calculations)
        .innerJoin(users, eq(calculations.userId, users.id))
        .where(eq(users.uid, uid))
        .orderBy(desc(calculations.createdAt));

      return rows.map((row: any) => ({
        ...row,
        details: decryptText(row.details),
        result: decryptText(row.result),
      }));
    }, []);
  } catch {
    return [];
  }
}

export async function deleteUserCalculation(
  uid: string,
  calcId?: string | number | null,
  details?: string | null,
  result?: string | null,
  type?: string | null,
  deleteAll?: boolean,
  userToken?: string
) {
  try {
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const clientOptions = userToken
          ? { global: { headers: { Authorization: `Bearer ${userToken}` } } }
          : undefined;
        const supabase = createClient(supabaseUrl, supabaseKey, clientOptions);

        if (deleteAll) {
          await supabase.from('calculations').delete().eq('user_id', uid);
        } else {
          if (calcId !== undefined && calcId !== null && calcId !== '') {
            const strId = calcId.toString();
            if (!strId.startsWith('item-') && !strId.startsWith('meta-')) {
              const numId = parseInt(strId, 10);
              if (!isNaN(numId)) {
                await supabase.from('calculations').delete().eq('id', numId).eq('user_id', uid);
              }
              await supabase.from('calculations').delete().eq('id', strId).eq('user_id', uid);
            }
          }

          if (details && result) {
            let query = supabase
              .from('calculations')
              .delete()
              .eq('user_id', uid)
              .eq('details', details)
              .eq('result', result);
            if (type) {
              query = query.eq('type', type);
            }
            await query;
          }
        }
      } catch {
        // Non-blocking catch
      }
    }

    // Parameterized SQL deletion scoped strictly to verified userId
    await safeDbQuery(async () => {
      const userRecords = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      if (userRecords.length > 0) {
        const dbUserId = userRecords[0].id;
        if (deleteAll) {
          await db.delete(calculations).where(eq(calculations.userId, dbUserId));
        } else if (calcId !== undefined && calcId !== null) {
          const numId = typeof calcId === 'number' ? calcId : parseInt(calcId.toString(), 10);
          if (!isNaN(numId) && numId > 0) {
            await db
              .delete(calculations)
              .where(and(eq(calculations.id, numId), eq(calculations.userId, dbUserId)));
          }
        }
      }
      return true;
    }, true);

    return true;
  } catch {
    return false;
  }
}

export async function deleteAllUserAccountData(uid: string, email?: string, userToken?: string): Promise<boolean> {
  try {
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
    if (supabaseUrl && supabaseKey && userToken) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${userToken}` } },
        });
        await Promise.allSettled([
          supabase.from('calculations').delete().eq('user_id', uid),
          supabase.from('notes').delete().eq('user_id', uid),
          supabase.from('tasks').delete().eq('user_id', uid),
          supabase.from('task_lists').delete().eq('user_id', uid),
        ]);
      } catch {
        // Ignore if Supabase tables are not provisioned
      }
    }

    await safeDbQuery(async () => {
      const userRecords = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      if (userRecords.length > 0) {
        const dbUserId = userRecords[0].id;
        await db.delete(calculations).where(eq(calculations.userId, dbUserId));
        await db.delete(securityAuditLogs).where(eq(securityAuditLogs.userUid, uid));
        await db.delete(users).where(eq(users.id, dbUserId));
      }
    }, undefined);

    await deleteStoredUserByEmailOrUid(email, uid);
    return true;
  } catch {
    return false;
  }
}
