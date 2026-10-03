import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { ApplicationAnswer, ApplicationForm } from '@gamecentral/shared';
import { users } from './auth';
import { communities } from './communities';
import { createdAt, tz, updatedAt } from './_helpers';

/** What a community asks people who apply to join. */
export const applicationForms = pgTable('application_forms', {
  communityId: uuid('community_id')
    .primaryKey()
    .references(() => communities.id, { onDelete: 'cascade' }),
  form: jsonb('form').$type<ApplicationForm>().notNull(),
  updatedAt: updatedAt(),
});

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    answers: jsonb('answers').$type<ApplicationAnswer[]>().notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'withdrawn'] })
      .notNull()
      .default('pending'),
    reviewerId: text('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    /** Shown to the applicant with the decision. */
    message: text('message').notNull().default(''),
    createdAt: createdAt(),
    reviewedAt: tz('reviewed_at'),
  },
  (t) => [
    index('applications_queue_idx').on(t.communityId, t.status, t.createdAt),
    index('applications_user_idx').on(t.userId),
    // One open application per person per community.
    uniqueIndex('applications_pending_idx')
      .on(t.communityId, t.userId)
      .where(sql`${t.status} = 'pending'`),
  ],
);
