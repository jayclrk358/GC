/** An upload's storage key: `u/<random>.<ext>`. */
export const MEDIA_KEY_RE = /^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif|mp4|webm)$/;

/** Any stored file: an upload, or one of its smaller copies (`u/<random>-sm.webp`). */
export const STORED_KEY_RE = /^u\/[a-z0-9]{8,40}(?:-(?:sm|md))?\.(webp|png|jpg|gif|mp4|webm)$/;

/**
 * Smaller copies made of each uploaded image (longest side, in pixels), so avatars, thumbnails
 * and cards don't download and decode the full-size file: `sm` for avatars and icons shown at
 * up to about 80px, `md` for images shown inline (chat, posts, galleries, cards, banners on
 * phones). The full size is for the media viewer and wide screens.
 */
export const IMAGE_VARIANTS = { sm: 160, md: 1024 } as const;
export type ImageVariant = keyof typeof IMAGE_VARIANTS;

/** Which copies each kind of upload gets. */
export const VARIANTS_BY_PURPOSE: Readonly<Record<string, readonly ImageVariant[]>> = {
  avatar: ['sm'],
  icon: ['sm'],
  banner: ['md'],
  background: ['md'],
  'channel-background': ['md'],
  gallery: ['md'],
  content: ['md'],
};

/** The key of a smaller copy of an image upload (images are stored as WebP), or null. */
export function variantKey(key: string, variant: ImageVariant): string | null {
  if (!MEDIA_KEY_RE.test(key) || !key.endsWith('.webp')) return null;
  return `${key.slice(0, -'.webp'.length)}-${variant}.webp`;
}

/** The upload key inside one of our media URLs (any host), e.g. an avatar URL saved earlier. */
export function keyFromMediaUrl(url: string | null | undefined): string | null {
  const m = /(?:^|\/)(u\/[a-z0-9]{8,40}\.(?:webp|png|jpg|gif|mp4|webm))$/.exec(url ?? '');
  return m ? m[1]! : null;
}
