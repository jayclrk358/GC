import {
  IMAGE_VARIANTS,
  keyFromMediaUrl,
  MEDIA_KEY_RE,
  variantKey,
  type ImageVariant,
} from '@gamecentral/shared';

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
  if (!key || !MEDIA_KEY_RE.test(key)) return null;
  return `${mediaBase()}/${key}`;
}

/** Link that saves an upload rather than opening it (see /api/media/download). */
export function downloadHref(key: string): string {
  return `/api/media/download/${key}`;
}

/** The full-size widths the smaller copies stand in for (avatars/icons, everything else). */
const FULL_WIDTH: Record<ImageVariant, number> = { sm: 512, md: 2560 };

export interface ImgSources {
  src: string;
  srcSet?: string;
  sizes?: string;
  /** The full image, loaded instead if the smaller copy is missing (see MEDIA_FALLBACK). */
  'data-full'?: string;
}

/**
 * `<img>` attributes for an upload shown small: its smaller copy (`variant`), or with `sizes`, a
 * srcset of the copy and the full image so the browser picks what the space and screen need.
 * Videos, GIFs and older formats have no copies and use the file itself.
 */
export function imgSources(
  key: string | null | undefined,
  variant: ImageVariant,
  sizes?: string,
): ImgSources | null {
  const full = mediaUrl(key);
  if (!full) return null;
  const copy = variantKey(key!, variant);
  if (!copy) return { src: full };
  const small = `${mediaBase()}/${copy}`;
  if (!sizes) return { src: small, 'data-full': full };
  return {
    src: small,
    srcSet: `${small} ${IMAGE_VARIANTS[variant]}w, ${full} ${FULL_WIDTH[variant]}w`,
    sizes,
    'data-full': full,
  };
}

/** Like imgSources, for a media URL saved earlier (e.g. a profile picture), on any host. */
export function imgSourcesFromUrl(
  url: string | null | undefined,
  variant: ImageVariant,
  sizes?: string,
): ImgSources | null {
  return imgSources(keyFromMediaUrl(url), variant, sizes);
}

/**
 * Runs before the page's images load: if a smaller copy isn't there (images uploaded before
 * copies were made, until the worker has caught up), show the full image instead.
 */
export const MEDIA_FALLBACK = `document.addEventListener('error',function(e){var i=e.target;if(i&&i.tagName==='IMG'&&i.dataset.full){var f=i.dataset.full;i.removeAttribute('data-full');i.removeAttribute('srcset');i.src=f}},true)`;
