import { z } from 'zod';

// Emoji: a community's own (custom emoji, small images) and the common Unicode ones by name.
// The plain helpers and data are in emoji-values.ts, which client code imports directly.

export * from './emoji-values';

export const emojiNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{2,32}$/, 'Use 2 to 32 letters, numbers or underscores.');

export const emojiInputSchema = z.object({
  name: emojiNameSchema,
  imageKey: z.string().regex(/^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif)$/, 'Upload an image.'),
});
