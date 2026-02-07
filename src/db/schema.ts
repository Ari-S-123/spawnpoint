import { pgTable, uuid, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'in_progress',
  'awaiting_verification',
  'needs_human',
  'completed',
  'failed'
]);

export const platformEnum = pgEnum('platform', ['instagram', 'tiktok', 'twitter', 'mintlify', 'vercel', 'sentry']);

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  inboxId: text('inbox_id').notNull(),
  operatorId: text('operator_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const setupTasks = pgTable('setup_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .references(() => agents.id, { onDelete: 'cascade' })
    .notNull(),
  platform: platformEnum('platform').notNull(),
  status: taskStatusEnum('status').default('pending').notNull(),
  vaultPath: text('vault_path'),
  browserSessionId: text('browser_session_id'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const credentials = pgTable('credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .references(() => agents.id, { onDelete: 'cascade' })
    .notNull(),
  platform: platformEnum('platform').notNull(),
  email: text('email').notNull(),
  password: text('password').notNull(),
  apiKey: text('api_key'),
  additionalData: jsonb('additional_data').$type<Record<string, string>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: text('operator_id').notNull(),
  action: text('action').notNull(),
  resourceId: text('resource_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
