// Kept free of zod so the application form editor stays small in the browser. The schemas in
// applications.ts validate input.

export const QUESTION_KINDS = ['short', 'long', 'choice', 'checkboxes'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const MAX_APPLICATION_QUESTIONS = 20;
