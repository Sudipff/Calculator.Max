import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase / Supabase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoURL: text('photo_url'),
  passwordHash: text('password_hash'),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const calculations = pgTable('calculations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  type: text('type').notNull(),
  details: text('details').notNull(),
  result: text('result').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
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
