import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase / Supabase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoURL: text('photo_url'),
  passwordHash: text('password_hash'),
  role: text('role').default('user').notNull(), // RBAC: 'user' | 'admin'
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const calculations = pgTable('calculations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(),
  details: text('details').notNull(), // Stored encrypted at rest (AES-256-GCM)
  result: text('result').notNull(), // Stored encrypted at rest (AES-256-GCM)
  createdAt: timestamp('created_at').defaultNow(),
});

export const securityAuditLogs = pgTable('security_audit_logs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid'),
  actorRole: text('actor_role').default('anonymous').notNull(),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  status: text('status').notNull(), // 'success' | 'denied' | 'error'
  ipAddress: text('ip_address'),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  calculations: many(calculations),
}));

export const calculationsRelations = relations(calculations, ({ one }) => ({
  user: one(users, {
    fields: [calculations.userId],
    references: [users.id],
  }),
}));
