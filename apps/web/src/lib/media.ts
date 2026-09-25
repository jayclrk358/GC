const KEY_RE = /^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif)$/;

/** Public URL for an upload key. Works on the server and in the browser. */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key || !KEY_RE.test(key)) return null;
  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '/media').replace(/\/$/, '');
  return `${base}/${key}`;
}
