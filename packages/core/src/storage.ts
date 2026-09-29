import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
   * A short-lived link that saves the file rather than opening it, or null when the media
   * server does that itself for `?download=1` (local storage behind Caddy).
   */
  downloadUrl(key: string, filename: string): Promise<string | null>;
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
  const safe = filename.replace(/[^\w.-]/g, '_');
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safe}"`,
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
