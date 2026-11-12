import { db, getPool, safeDbQuery } from './index';
import { users, calculations } from './schema';
import { eq, desc, and } from 'drizzle-orm';
import { getSupabaseConfig } from '@/utils/supabase/config';

export async function getOrCreateUser(uid: string, email: string, displayName?: string, photoURL?: string) {
  return await safeDbQuery(async () => {
    const result = await db
      .insert(users)
      .values({
        uid,
        email: email || '',
        displayName: displayName || '',
        photoURL: photoURL || '',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: email || '',
          displayName: displayName || '',
          photoURL: photoURL || '',
        },
      })
      .returning();
    return result[0];
  }, { uid, email, displayName, photoURL });
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
      .returning();
    return result[0];
  }, { uid, passwordHash, updated: true });
}

export async function saveUserCalculation(
  uid: string,
  type: string,
  details: string,
  result: string,
  userToken?: string
) {
  try {
    // 1. Try Supabase table first if available
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
      } catch (sErr) {
        // Fallback gracefully
      }
    }

    // 2. Try SQL db safely with timeout protection
    return await safeDbQuery(async () => {
      const userRecords = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      let userId: number;
      if (userRecords.length === 0) {
        const newUser = await db.insert(users).values({ uid, email: '' }).returning();
        userId = newUser[0].id;
      } else {
        userId = userRecords[0].id;
      }

      const inserted = await db
        .insert(calculations)
        .values({
          userId,
          type,
          details,
          result,
        })
        .returning();

      return inserted[0];
    }, {
      id: Date.now(),
      userId: uid,
      type,
      details,
      result,
      createdAt: new Date(),
    });
  } catch (error) {
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
            details: d.details,
            result: d.result,
            createdAt: d.created_at,
          }));
        }
      } catch (sErr) {
        // Continue to SQL fallback if Supabase errored
      }
    }

    // 2. Try SQL DB safely with timeout protection
    return await safeDbQuery(async () => {
      const result = await db
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

      return result;
    }, []);
  } catch (error) {
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
    // 1. Try Supabase
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const clientOptions = userToken
          ? { global: { headers: { Authorization: `Bearer ${userToken}` } } }
          : undefined;
        const supabase = createClient(supabaseUrl, supabaseKey, clientOptions);

        if (deleteAll) {
          await supabase
            .from('calculations')
            .delete()
            .eq('user_id', uid);
        } else {
          if (calcId !== undefined && calcId !== null && calcId !== '') {
            const strId = calcId.toString();
            if (!strId.startsWith('item-') && !strId.startsWith('meta-')) {
              const numId = parseInt(strId, 10);
              if (!isNaN(numId)) {
                await supabase
                  .from('calculations')
                  .delete()
                  .eq('id', numId);
              }
              await supabase
                .from('calculations')
                .delete()
                .eq('id', strId);
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

            if (userToken) {
              let rlsQuery = supabase
                .from('calculations')
                .delete()
                .eq('details', details)
                .eq('result', result);
              if (type) {
                rlsQuery = rlsQuery.eq('type', type);
              }
              await rlsQuery;
            }
          }
        }
      } catch (sErr) {
        // Non-blocking catch
      }
    }

    // 2. Try SQL DB safely with timeout protection
    await safeDbQuery(async () => {
      const userRecords = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      if (userRecords.length > 0) {
        const dbUserId = userRecords[0].id;
        if (deleteAll) {
          await db
            .delete(calculations)
            .where(eq(calculations.userId, dbUserId));
        } else {
          if (calcId !== undefined && calcId !== null) {
            const numId = typeof calcId === 'number' ? calcId : parseInt(calcId.toString(), 10);
            if (!isNaN(numId) && numId > 0) {
              await db
                .delete(calculations)
                .where(and(eq(calculations.id, numId), eq(calculations.userId, dbUserId)));
            }
          }

          if (details && result) {
            const conditions = [
              eq(calculations.userId, dbUserId),
              eq(calculations.details, details),
              eq(calculations.result, result),
            ];
            if (type) {
              conditions.push(eq(calculations.type, type));
            }
            await db
              .delete(calculations)
              .where(and(...conditions));
          }
        }
      }
      return true;
    }, true);

    return true;
  } catch (error) {
    return false;
  }
}



