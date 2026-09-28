import { describe, expect, it } from 'vitest';
import { PLAN_LIMITS } from '@magnox/shared';
import { processVideo } from './video';

function box(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

/** A track header ("tkhd", version 0) with the size as 16.16 fixed point at the end. */
function tkhd(width: number, height: number): Buffer {
  const body = Buffer.alloc(84);
  body.writeUInt32BE(width << 16, 76);
  body.writeUInt32BE(height << 16, 80);
  return box('tkhd', body);
}

const ftyp = (brand: string) => box('ftyp', Buffer.from(`${brand}\0\0\0\0isomiso2`, 'latin1'));

describe('processVideo', () => {
  it('accepts an MP4 and reads the video track size, skipping audio tracks', () => {
    const file = Buffer.concat([
      ftyp('isom'),
      box('moov', Buffer.concat([box('trak', tkhd(0, 0)), box('trak', tkhd(1280, 720))])),
    ]);
    const out = processVideo(file);
    expect(out.key).toMatch(/^u\/[a-z0-9]+\.mp4$/);
    expect(out.mime).toBe('video/mp4');
    expect([out.width, out.height]).toEqual([1280, 720]);
    expect(out.animated).toBe(false);
    expect(out.body).toBe(file);
  });

  it('accepts a WebM file', () => {
    const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]);
    const out = processVideo(
      Buffer.concat([ebml, Buffer.from('webm', 'latin1'), Buffer.alloc(32)]),
    );
    expect(out.key).toMatch(/\.webm$/);
    expect(out.mime).toBe('video/webm');
  });

  it('rejects other files, whatever they are named', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    expect(() => processVideo(png)).toThrow(/MP4 or WebM/);
    // Matroska that isn't WebM, and an MP4-like box with an unknown brand.
    const mkv = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('matroska')]);
    expect(() => processVideo(mkv)).toThrow(/MP4 or WebM/);
    expect(() => processVideo(ftyp('qt  '))).toThrow(/MP4 or WebM/);
  });

  it('rejects videos over the size limit', () => {
    const big = Buffer.concat([ftyp('mp42'), Buffer.alloc(PLAN_LIMITS.free.videoMb * 1_000_000)]);
    expect(() => processVideo(big)).toThrow(/too large \(max 50 MB\)/);
    // A bigger plan allows it.
    expect(processVideo(big, PLAN_LIMITS.plus.videoMb * 1_000_000).mime).toBe('video/mp4');
  });
});
