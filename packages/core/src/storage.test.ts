import { describe, expect, it } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { attachmentDisposition, cleanFilename, downloadFilename, presignDownload } from './storage';

describe('presignDownload', () => {
  it('signs a short-lived link that saves the file as an attachment', async () => {
    const client = new S3Client({
      region: 'auto',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      forcePathStyle: true,
      credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' },
    });
    const url = new URL(
      await presignDownload(client, 'gamecentral', 'u/abcdefgh12.mp4', 'Boss fight.mp4'),
    );
    expect(url.origin).toBe('https://account.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/gamecentral/u/abcdefgh12.mp4');
    expect(url.searchParams.get('response-content-disposition')).toBe(
      `attachment; filename="Boss fight.mp4"; filename*=UTF-8''Boss%20fight.mp4`,
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('upload filenames', () => {
  it('keeps the name but drops folders and invisible characters', () => {
    expect(cleanFilename('C:\\Users\\me\\Pictures\\raid night.png')).toBe('raid night.png');
    expect(cleanFilename('../../etc/passwd')).toBe('passwd');
    expect(cleanFilename('bad\u0000\nname.gif')).toBe('badname.gif');
    // Right-to-left override that would show "invoice_gpj.exe" as "invoice_exe.jpg".
    expect(cleanFilename('invoice_\u202egpj.exe')).toBe('invoice_gpj.exe');
    expect(cleanFilename('   ')).toBeNull();
    expect(cleanFilename('..')).toBeNull();
    expect(cleanFilename(null)).toBeNull();
  });

  it('shortens long names but keeps the extension', () => {
    const name = cleanFilename(`${'a'.repeat(300)}.jpeg`)!;
    expect(name).toHaveLength(120);
    expect(name.endsWith('.jpeg')).toBe(true);
  });

  it('saves downloads under the uploaded name with the stored format', () => {
    expect(downloadFilename('clip.mp4', 'u/abcdefgh12.mp4')).toBe('clip.mp4');
    expect(downloadFilename('IMG_2231.JPG', 'u/abcdefgh12.webp')).toBe('IMG_2231.webp');
    expect(downloadFilename('my.map.v2.png', 'u/abcdefgh12.webp')).toBe('my.map.v2.webp');
    expect(downloadFilename('README', 'u/abcdefgh12.webp')).toBe('README.webp');
    expect(downloadFilename(null, 'u/abcdefgh12.webp')).toBe('gamecentral-abcdefgh12.webp');
    expect(downloadFilename('.png', 'u/abcdefgh12.webp')).toBe('.png.webp');
  });

  it('builds a header that works for any name', () => {
    expect(attachmentDisposition('Screenshot 2026.webp')).toBe(
      `attachment; filename="Screenshot 2026.webp"; filename*=UTF-8''Screenshot%202026.webp`,
    );
    expect(attachmentDisposition('Größe "final" 100%.webp')).toBe(
      `attachment; filename="Gr__e _final_ 100_.webp"; filename*=UTF-8''Gr%C3%B6%C3%9Fe%20%22final%22%20100%25.webp`,
    );
    expect(attachmentDisposition("it's (1).mp4")).toBe(
      `attachment; filename="it's (1).mp4"; filename*=UTF-8''it%27s%20%281%29.mp4`,
    );
  });
});
