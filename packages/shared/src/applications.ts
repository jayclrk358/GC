import { z } from 'zod';

// Applying to join a community ("Apply" join mode) and the welcome steps after joining.

export const QUESTION_KINDS = ['short', 'long', 'choice', 'checkboxes'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const applicationQuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{6,24}$/),
    label: z.string().trim().min(1, 'Every question needs some text.').max(200),
    kind: z.enum(QUESTION_KINDS),
    required: z.boolean().default(true),
    /** For choice and checkboxes questions. */
    options: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  })
  .superRefine((q, ctx) => {
    if ((q.kind === 'choice' || q.kind === 'checkboxes') && q.options.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Give at least two options to choose from.',
      });
    }
  });
export type ApplicationQuestion = z.infer<typeof applicationQuestionSchema>;

export const MAX_APPLICATION_QUESTIONS = 20;

export const applicationFormSchema = z.object({
  intro: z.string().trim().max(2000).default(''),
  questions: z
    .array(applicationQuestionSchema)
    .min(1, 'Ask at least one question.')
    .max(MAX_APPLICATION_QUESTIONS),
});
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

/** What a community asks until it writes its own questions. */
export const DEFAULT_APPLICATION_FORM: ApplicationForm = {
  intro: '',
  questions: [
    {
      id: 'whyjoin',
      label: 'Why would you like to join?',
      kind: 'long',
      required: true,
      options: [],
    },
  ],
};

/** One answer as stored: the question's wording then, so later edits don't change it. */
export interface ApplicationAnswer {
  questionId: string;
  label: string;
  value: string | string[];
}

const MAX_SHORT = 300;
const MAX_LONG = 4000;

/**
 * Check answers (questionId → text, or a list for checkboxes) against a form, returning them in
 * the form's order. Throws a ZodError naming the question on a problem.
 */
export function parseApplicationAnswers(form: ApplicationForm, raw: unknown): ApplicationAnswer[] {
  const given = z.record(z.string(), z.union([z.string(), z.array(z.string())])).parse(raw);
  const issues: z.core.$ZodIssue[] = [];
  const out: ApplicationAnswer[] = [];
  for (const q of form.questions) {
    const v = given[q.id];
    const problem = (message: string) =>
      issues.push({ code: 'custom', path: [q.id], message, input: v } as z.core.$ZodIssue);
    if (q.kind === 'checkboxes') {
      const picked = (Array.isArray(v) ? v : v ? [v] : []).filter((x) => q.options.includes(x));
      if (q.required && !picked.length) problem('Choose at least one.');
      out.push({ questionId: q.id, label: q.label, value: [...new Set(picked)] });
      continue;
    }
    const text = typeof v === 'string' ? v.trim() : '';
    if (q.required && !text) {
      problem('This question needs an answer.');
    } else if (q.kind === 'choice' && text && !q.options.includes(text)) {
      problem('Choose one of the options.');
    } else if (text.length > (q.kind === 'long' ? MAX_LONG : MAX_SHORT)) {
      problem(`Keep it under ${q.kind === 'long' ? MAX_LONG : MAX_SHORT} characters.`);
    }
    out.push({ questionId: q.id, label: q.label, value: text });
  }
  if (issues.length) throw new z.ZodError(issues);
  return out;
}

export const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  /** Shown to the applicant with the decision. */
  message: z.string().trim().max(1000).default(''),
});

// ── Welcome steps (onboarding) ──────────────────────────────────────────────

export const onboardingSchema = z.object({
  enabled: z.boolean().default(false),
  welcome: z.string().trim().max(2000).default(''),
  rules: z.array(z.string().trim().min(1).max(500)).max(25).default([]),
  /** Members can only read until they've accepted the rules. */
  requireAccept: z.boolean().default(false),
});
export type Onboarding = z.infer<typeof onboardingSchema>;
