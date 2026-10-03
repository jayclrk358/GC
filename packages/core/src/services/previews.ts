import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema, type LinkPreviewData, type MessageEmbed } from '@gamecentral/db';
import { extractLinks, parseOpenGraph, PREVIEW_HEAD_BYTES } from '@gamecentral/shared';
import { processImage } from '../images';
import { logger } from '../logger';
import { safeFetch } from '../net/safe-fetch';
import { siteOf } from '../net/site';
import { rateLimit } from '../ratelimit';
import { storage } from '../storage';
import { setMessageEmbeds } from './chat';

const log = logger('previews');

const OK_TTL_MS = 24 * 3600 * 1000;
const FAIL_TTL_MS = 3600 * 1000;

const hashUrl = (url: string) => createHash('sha256').update(url).digest('hex');

/**
 * Preview images are named after their address, so refreshing a preview (daily) reuses the file
 * everyone already has cached instead of storing and downloading a new copy.
 */
const previewImageKey = (imageUrl: string) => `u/${hashUrl(imageUrl).slice(0, 40)}.webp`;

/** A site or server has been asked for enough for now: try again later (and cache nothing). */
class Throttled extends Error {}

/**
 * Be polite to any one site and any one server, and don't let chat be used to hammer either.
 * Checked before connecting to every address (redirects and images too), and keyed by the
 * registrable domain and the IP, so made-up subdomains don't get round it.
 */
async function politeTo(target: { host: string; ip: string }): Promise<void> {
  const [site, server] = await Promise.all([
    rateLimit(`preview-site:${siteOf(target.host)}`, 60, 60),
    rateLimit(`preview-ip:${target.ip}`, 60, 60),
  ]);
  if (!site.ok || !server.ok) throw new Throttled('Too many previews for this site');
}

async function fetchPreview(
  url: string,
  previous: LinkPreviewData | null,
): Promise<LinkPreviewData | null> {
  const page = await safeFetch(url, {
    accept: 'text/html,application/xhtml+xml;q=0.9',
    // Only the page's <head> (at most this much of it) is read for the preview.
    maxBytes: PREVIEW_HEAD_BYTES,
    onConnect: politeTo,
  });
  if (page.status >= 400 || !/text\/html|application\/xhtml/.test(page.contentType)) return null;
  const og = parseOpenGraph(page.body.toString('utf8'), page.url);
  if (!og) return null;
  let image: Pick<LinkPreviewData, 'imageKey' | 'imageWidth' | 'imageHeight'> = {
    imageKey: null,
    imageWidth: null,
    imageHeight: null,
  };
  if (og.image && previous?.imageKey === previewImageKey(og.image)) {
    image = {
      imageKey: previous.imageKey,
      imageWidth: previous.imageWidth,
      imageHeight: previous.imageHeight,
    };
  } else if (og.image) {
    try {
      // Re-host the image so viewers never load third-party content (or leak their IP).
      const res = await safeFetch(og.image, {
        accept: 'image/*',
        maxBytes: 5_000_000,
        strictSize: true,
        onConnect: politeTo,
      });
      if (res.status < 400 && res.contentType.startsWith('image/')) {
        // Thumbnails are shown still, so an animated image keeps just its first frame.
        const img = await processImage(res.body, 'preview');
        const key = previewImageKey(og.image);
        await storage().put(key, img.body, 'image/webp');
        image = { imageKey: key, imageWidth: img.width, imageHeight: img.height };
      }
    } catch (err) {
      if (err instanceof Throttled) throw err;
      log.debug({ err: (err as Error).message, url: og.image }, 'preview image skipped');
    }
  }
  return { title: og.title, description: og.description, siteName: og.siteName, ...image };
}

/**
 * A cached or freshly fetched preview, or null when the page has nothing to show (or it can't be
 * fetched just now). `userId`: whose message it's for, who gets so many fresh fetches.
 */
export async function getLinkPreview(
  url: string,
  opts: { userId?: string | null } = {},
): Promise<LinkPreviewData | null> {
  const urlHash = hashUrl(url);
  const cached = await db.query.linkPreviews.findFirst({
    where: eq(schema.linkPreviews.urlHash, urlHash),
  });
  if (cached) {
    const age = Date.now() - cached.fetchedAt.getTime();
    if (age < (cached.ok ? OK_TTL_MS : FAIL_TTL_MS)) return cached.ok ? cached.data : null;
  }
  if (!URL.canParse(url)) return null;
  // Cached previews are free; each person gets so many fresh fetches.
  if (opts.userId && !(await rateLimit(`preview-user:${opts.userId}`, 30, 600)).ok) return null;
  let data: LinkPreviewData | null = null;
  try {
    data = await fetchPreview(url, cached?.ok ? cached.data : null);
  } catch (err) {
    // Not remembered as a failure: it can be tried again once the site has had a rest.
    if (err instanceof Throttled) return null;
    log.debug({ err: (err as Error).message, url }, 'preview fetch failed');
  }
  await db
    .insert(schema.linkPreviews)
    .values({ urlHash, url, ok: Boolean(data), data, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.linkPreviews.urlHash,
      set: { ok: Boolean(data), data, fetchedAt: new Date() },
    });
  return data;
}

/** Worker job: build embeds for a message's links. */
export async function processLinkPreviews(messageId: string): Promise<number> {
  const msg = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!msg || msg.deletedAt) return 0;
  const links = extractLinks(msg.body);
  const embeds: MessageEmbed[] = [];
  for (const url of links) {
    const p = await getLinkPreview(url, { userId: msg.authorId });
    if (p) embeds.push({ url, ...p });
  }
  // The message may have been edited while we were fetching; only write if links still match.
  const fresh = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!fresh || fresh.deletedAt || extractLinks(fresh.body).join(' ') !== links.join(' ')) return 0;
  if (embeds.length || fresh.embeds.length) await setMessageEmbeds(messageId, embeds);
  return embeds.length;
}
