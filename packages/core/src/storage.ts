import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const KEY_RE = /^u\/[a-z0-9]{8,40}\.(webp|png|jpg|gif)$/;

export function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
}

function repoRoot(): string {
  // apps/web runs with cwd apps/web; worker/realtime with their own dirs. Walk up to the repo.
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (
      dir.endsWith('/apps/web') ||
      dir.endsWith('/apps/worker') ||
      dir.endsWith('/apps/realtime')
    ) {
      return resolve(dir, '../..');
    }
    if (dir.match(/\/packages\/[a-z]+$/)) return resolve(dir, '../..');
    dir = dirname(dir);
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
