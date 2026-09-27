import { z } from 'zod';
import { MAX_ATTACHMENTS } from './chat';
import { richDocSchema } from './richtext-schema';

// Input validation for chat messages (constants and helpers are in chat.ts).

export const attachmentInputSchema = z.object({
  key: z.string().regex(/^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif|mp4|webm)$/),
  alt: z.string().trim().max(1000).default(''),
});

export const messageInputSchema = z.object({
  body: richDocSchema,
  replyToId: z.string().uuid().nullable().default(null),
  attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS).default([]),
  /** Client-generated id; a retried send with the same nonce returns the first message. */
  nonce: z
    .string()
    .regex(/^[a-zA-Z0-9-]{8,64}$/)
    .optional(),
  /** Whether replying should notify the person being replied to. */
  mentionReplied: z.boolean().default(true),
});
export type MessageInput = z.infer<typeof messageInputSchema>;

export const messageEditSchema = z.object({ body: richDocSchema });
