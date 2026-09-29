import { describe, expect, it } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { presignDownload } from './storage';

describe('presignDownload', () => {
  it('signs a short-lived link that saves the file as an attachment', async () => {
    const client = new S3Client({
      region: 'auto',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      forcePathStyle: true,
      credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' },
    });
    const url = new URL(
      await presignDownload(client, 'magnox', 'u/abcdefgh12.mp4', 'magnox-abcdefgh12.mp4'),
    );
    expect(url.origin).toBe('https://account.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/magnox/u/abcdefgh12.mp4');
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="magnox-abcdefgh12.mp4"',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});
