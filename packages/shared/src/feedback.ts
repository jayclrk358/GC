// Feedback people send Game Central's team, shared by the database, the server and the forms.

export const FEEDBACK_KINDS = ['bug', 'idea', 'question', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** New until someone on the team looks at it; then where it's got to. */
export const FEEDBACK_STATUSES = ['new', 'planned', 'in_progress', 'done', 'declined'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_TITLE_MAX = 120;
export const FEEDBACK_BODY_MAX = 5000;
export const FEEDBACK_REPLY_MAX = 5000;
