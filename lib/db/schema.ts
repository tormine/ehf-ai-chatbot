import type { InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  text,
  primaryKey,
  foreignKey,
  boolean,
} from 'drizzle-orm/pg-core';

export const user = pgTable('User', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  userId: uuid('userId').references(() => user.id).notNull(),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable('Message', {
  id: uuid('id').primaryKey(),
  content: text('content').notNull(),
  role: varchar('role', { 
    enum: ['user', 'assistant', 'system', 'tool'] 
  }).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  chatId: uuid('chatId').references(() => chat.id).notNull(),
});

export type Message = InferSelectModel<typeof message>;

export const vote = pgTable('Vote', {
  chatId: uuid('chatId').references(() => chat.id).notNull(),
  messageId: uuid('messageId').references(() => message.id).notNull(),
  isUpvoted: boolean('isUpvoted').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.chatId, table.messageId] }),
}));

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable('Document', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  kind: varchar('kind', { enum: ['text', 'code', 'image'] }).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  userId: uuid('userId').references(() => user.id).notNull(),
});

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable('Suggestion', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('documentId').references(() => document.id).notNull(),
  documentCreatedAt: timestamp('documentCreatedAt').notNull(),
  originalText: text('originalText').notNull(),
  suggestedText: text('suggestedText').notNull(),
  description: text('description'),
  isResolved: boolean('isResolved').notNull().default(false),
  userId: uuid('userId').references(() => user.id).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export type Suggestion = InferSelectModel<typeof suggestion>;
