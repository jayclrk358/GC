import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /**
   * A short-lived link that saves the file under `filename` rather than opening it, or null
   * when the file is on this machine and can be streamed with `open` instead (local storage).
   */
  downloadUrl(key: string, filename: string): Promise<string | null>;
  /** The file as a stream, or null if it's missing or not stored on this machine (S3). */
  open(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
}

/**
 * The name a file had on the uploader's device, made safe to keep and to send back: no folders,
 * control characters or text-direction tricks (which can disguise "gpj.exe" as "exe.jpg").
 */
export function cleanFilename(raw: string | null | undefined): string | null {
  const name = String(raw ?? '')
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name === '.' || name === '..') return null;
  if (name.length <= 120) return name;
  // Keep the extension when shortening.
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
  return name.slice(0, 120 - ext.length).trimEnd() + ext;
}

/**
 * What a download is saved as: the uploaded name with the extension of the stored file (images
 * are converted to WebP when uploaded, so "photo.png" is saved as "photo.webp").
 */
export function downloadFilename(original: string | null | undefined, key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1);
  const name = cleanFilename(original);
  const dot = name?.lastIndexOf('.') ?? -1;
  const base = (name && dot > 0 ? name.slice(0, dot) : name)?.trim();
  return `${base || `magnox-${key.slice(2, key.lastIndexOf('.'))}`}.${ext}`;
}

/**
 * A Content-Disposition header that saves the file under `filename`: an ASCII fallback for old
 * clients, and the exact (UTF-8) name for everything else (RFC 6266).
 */
export function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%]/g, '_');
  const exact = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${exact}`;
}

/**
 * A presigned GET that asks the bucket to send the file as an attachment. Works on any
 * S3-compatible store (R2, B2, MinIO...), whatever serves the public media domain.
 */
export function presignDownload(
  client: S3Client,
  bucket: string,
  key: string,
  filename: string,
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: attachmentDisposition(filename),
    }),
    { expiresIn: 300 },
  );
}

const KEY_RE = /^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif|mp4|webm)$/;

export function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
}

/** The monorepo root (where pnpm-workspace.yaml lives), so every app shares one storage folder. */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

class LocalDriver implements StorageDriver {
  private readonly root = env().STORAGE_LOCAL_DIR || join(repoRoot(), 'storage');

  private path(key: string): string {
    assertKey(key);
    return join(this.root, key);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async downloadUrl(): Promise<string | null> {
    return null;
  }

  async open(key: string) {
    const p = this.path(key);
    try {
      const { size } = await stat(p);
      const body = Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>;
      return { body, size };
    } catch {
      return null;
    }
  }
}

class S3Driver implements StorageDriver {
  private readonly client = new S3Client({
    region: env().S3_REGION,
    endpoint: env().S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(env().S3_ENDPOINT),
    credentials: {
      accessKeyId: env().S3_ACCESS_KEY_ID,
      secretAccessKey: env().S3_SECRET_ACCESS_KEY,
    },
  });

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        ContentDisposition: 'inline',
      }),
    );
  }

  async get(): Promise<Buffer | null> {
    // Media is served directly by the bucket/CDN in S3 mode.
    return null;
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  }

  async downloadUrl(key: string, filename: string): Promise<string | null> {
    assertKey(key);
    return presignDownload(this.client, env().S3_BUCKET, key, filename);
  }

  async open(): Promise<null> {
    return null;
  }
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  driver ??= env().STORAGE_DRIVER === 's3' ? new S3Driver() : new LocalDriver();
  return driver;
}

export function mediaUrl(key: string | null | undefined): string | null {
  if (!key || !KEY_RE.test(key)) return null;
  return `${env().MEDIA_BASE_URL.replace(/\/$/, '')}/${key}`;
}
