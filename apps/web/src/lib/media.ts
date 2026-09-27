const KEY_RE = /^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif)$/;

let clientBase: string | undefined;

/**
 * Where uploads are served from. Read when the server runs (not baked in at build time), so one
 * Docker image works for any domain. The root layout passes it to the browser in a meta tag.
 */
export function mediaBase(): string {
  if (typeof window === 'undefined') {
    return (process.env['MEDIA_BASE_URL'] || '/media').replace(/\/$/, '');
  }
  clientBase ??=
    document.querySelector<HTMLMetaElement>('meta[name="mx-media-base"]')?.content || '/media';
  return clientBase;
}

/** Public URL for an upload key. Works on the server and in the browser. */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key || !KEY_RE.test(key)) return null;
  return `${mediaBase()}/${key}`;
}
