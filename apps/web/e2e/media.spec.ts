import { expect, test, type Page } from '@playwright/test';
import { createCommunity, expectAccessible, signUp, uniqueUser } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPQqLCBIwbiOABkgw3Be6BngQAAAABJRU5ErkJggg==',
  'base64',
);

/** Record a short, real WebM clip in the browser (a colour-cycling canvas). */
async function recordWebm(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d')!;
    const rec = new MediaRecorder(canvas.captureStream(15), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    let frame = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = `hsl(${(frame++ * 40) % 360} 80% 50%)`;
      ctx.fillRect(0, 0, 160, 90);
    }, 50);
    await new Promise((r) => setTimeout(r, 1500));
    rec.stop();
    clearInterval(timer);
    await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

test('chat images and videos open in the media viewer', async ({ page }) => {
  await signUp(page, uniqueUser('media'), '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });
  await page.goto(`/c/${slug}/chat/lounge`);
  const composer = page.getByRole('textbox', { name: 'Message #lounge' });
  await expect(composer).toBeVisible();
  await page.waitForFunction(() => document.readyState === 'complete');

  // Attach an image and a video, each with a description. Hold the uploads back for a moment so
  // their progress bars can be seen.
  const webm = await recordWebm(page);
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/uploads', async (route) => {
    await held;
    await route.continue();
  });
  await page.locator('input[type=file][multiple]').setInputFiles([
    { name: 'map.png', mimeType: 'image/png', buffer: PNG },
    { name: 'raid.webm', mimeType: 'video/webm', buffer: webm },
  ]);
  await expect(page.getByRole('progressbar', { name: 'Uploading map.png' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Uploading raid.webm' })).toBeVisible();
  release();
  await page.getByLabel('Description of image 1').fill('Map of the spawn area');
  await page.getByLabel('Description of video 2').fill('Clip of the boss fight');
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 20_000 });
  await page.unroute('**/api/uploads');
  await composer.click();
  await composer.fill('Raid highlights');
  await composer.press('Enter');
  const msg = page.locator('article[data-message-id]').filter({ hasText: 'Raid highlights' });
  await expect(msg.getByText('Sending…')).toBeHidden();

  // The video plays inline, with its description as a caption.
  const inline = msg.locator('video[aria-label="Clip of the boss fight"]');
  await expect(inline).toBeVisible();
  await expect(msg.getByText('Clip of the boss fight')).toBeVisible();

  // The image opens the viewer: zoom, download and step to the video.
  const opener = msg.getByRole('button', { name: 'Map of the spawn area' });
  await opener.click();
  const viewer = page.getByRole('dialog', { name: 'Image 1 of 2' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img', { name: 'Map of the spawn area' })).toBeVisible();
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await expect(viewer.getByText('150%')).toBeVisible();
  const download = viewer.getByRole('link', { name: 'Download' });
  const href = await download.getAttribute('href');
  expect(href).toMatch(/^\/api\/media\/download\/u\/[a-z0-9]+\.webp$/);
  await expectAccessible(page, 'media viewer');

  // Download saves the file under the name it was uploaded with (images are stored as WebP).
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toBe('map.webp');
  const saved = await page.request.get(href!);
  expect(saved.headers()['content-disposition']).toContain('attachment; filename="map.webp"');
  await expect(viewer).toBeVisible();
  await page.keyboard.press('ArrowRight');
  const videoViewer = page.getByRole('dialog', { name: 'Video 2 of 2' });
  await expect(videoViewer).toBeVisible();
  const [clip] = await Promise.all([
    page.waitForEvent('download'),
    videoViewer.getByRole('link', { name: 'Download' }).click(),
  ]);
  expect(clip.suggestedFilename()).toBe('raid.webm');

  // The media origin serves byte ranges for seeking.
  const video = videoViewer.locator('video');
  const src = await video.getAttribute('src');
  const range = await page.request.get(src!, { headers: { range: 'bytes=0-15' } });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(16);

  // Play and pause from the toolbar.
  await videoViewer.getByRole('button', { name: 'Play' }).click();
  await expect(videoViewer.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  await videoViewer.getByRole('button', { name: 'Pause' }).click();
  await expect(videoViewer.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  // Close returns focus to the image that opened it; Escape closes too.
  await videoViewer.getByRole('button', { name: 'Close' }).click();
  await expect(videoViewer).toBeHidden();
  await expect(opener).toBeFocused();
  await msg.getByRole('button', { name: 'Open video in viewer' }).click();
  await expect(page.getByRole('dialog', { name: 'Video 2 of 2' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('uploads reject files that only claim to be videos', async ({ page }) => {
  await signUp(page, uniqueUser('fakevid'), '/');
  const res = await page.request.post('/api/uploads', {
    multipart: {
      purpose: 'video',
      file: { name: 'clip.mp4', mimeType: 'video/mp4', buffer: PNG },
    },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/MP4 or WebM/);
});

test('images in forum posts open in the media viewer', async ({ page }) => {
  await signUp(page, uniqueUser('postimg'), '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });
  await page.goto(`/c/${slug}/forum/support/new`);
  await page.getByLabel('Title').fill('Where is the portal?');
  await page.getByRole('textbox', { name: 'Message' }).fill('It is here:');
  await page
    .locator('input[type=file]:not([multiple])')
    .setInputFiles({ name: 'portal.png', mimeType: 'image/png', buffer: PNG });
  const describe = page.getByRole('dialog', { name: 'Describe this image' });
  await describe.getByLabel('Image description').fill('Portal behind the spawn castle');
  await describe.getByRole('button', { name: 'Insert image' }).click();
  await page.getByRole('button', { name: 'Post thread' }).click();
  await page.waitForURL(/\/t\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'Portal behind the spawn castle' }).click();
  const viewer = page.getByRole('dialog', { name: 'Image 1 of 1' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText('Portal behind the spawn castle')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Next' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('gallery images step through the media viewer', async ({ page }) => {
  await signUp(page, uniqueUser('gallery'), '/new');
  const { slug } = await createCommunity(page, { template: 'Fan hub' });
  await page.goto(`/c/${slug}/settings/page`);
  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByRole('menuitem', { name: /^Gallery/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Gallery block' });
  for (const [i, alt] of ['Castle at dawn', 'Castle at night'].entries()) {
    await dialog.getByRole('button', { name: 'Add item' }).click();
    const item = dialog.getByRole('group', { name: `Image ${i + 1}` });
    await item
      .locator('input[type=file]')
      .setInputFiles({ name: `castle-${i}.png`, mimeType: 'image/png', buffer: PNG });
    await expect(item.getByRole('img')).toBeVisible();
    await item.getByLabel('Image description (alt text)').fill(alt);
  }
  await dialog.getByRole('button', { name: 'Save block' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Block saved')).toBeVisible();

  await page.goto(`/c/${slug}`);
  await page.getByRole('button', { name: 'Castle at night' }).click();
  const viewer = page.getByRole('dialog', { name: 'Image 2 of 2' });
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog', { name: 'Image 1 of 2' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Castle at dawn')).toBeVisible();
  await expectAccessible(page, 'gallery viewer');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Castle at night' })).toBeFocused();
});

test('videos that browsers cannot play are caught before and after upload', async ({ page }) => {
  await signUp(page, uniqueUser('badvid'), '/new');
  const { slug } = await createCommunity(page, { template: 'Game server' });
  await page.goto(`/c/${slug}/chat/lounge`);
  const composer = page.getByRole('textbox', { name: 'Message #lounge' });
  await expect(composer).toBeVisible();
  await page.waitForFunction(() => document.readyState === 'complete');

  // An MP4 whose picture can't be decoded is refused before it uploads.
  const box = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body]);
  };
  const junk = Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\0\0isomiso2', 'latin1')),
    box('mdat', Buffer.alloc(2048, 7)),
  ]);
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: 'hevc.mp4', mimeType: 'video/mp4', buffer: junk });
  await expect(page.getByText("Your browser can't play this video")).toBeVisible();
  await page.getByRole('button', { name: 'Remove attachment 1' }).click();

  // A video that fails to load later (here: missing from the media server) offers a download.
  const webm = await recordWebm(page);
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: webm });
  await page.getByLabel('Description of video 1').fill('Short clip');
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 20_000 });
  await composer.click();
  await composer.fill('Watch this');
  await composer.press('Enter');
  const msg = page.locator('article[data-message-id]').filter({ hasText: 'Watch this' });
  await expect(msg.locator('video')).toBeVisible();
  await page.route(/\/u\/[a-z0-9]+\.webm/, (route) => route.fulfill({ status: 404 }));
  await page.reload();
  await expect(msg.getByText("This video can't be played in your browser.")).toBeVisible();
  await expect(msg.getByRole('link', { name: 'Download' })).toHaveAttribute(
    'href',
    /^\/api\/media\/download\/u\/[a-z0-9]+\.webm$/,
  );
  await expectAccessible(page, 'unplayable video');
});
