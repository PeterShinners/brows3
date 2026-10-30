import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const bucketUrl = '/bucket?name=demo-bucket&region=us-east-1';

// The CDN module is replaced with a stub so the test stays offline while still
// exercising the bridge script, the connect string verification and the element.
const STUB_MODULE = `
const RESULT = {
  status: 'success',
  source: 'render',
  media: {
    kind: 'image',
    mime: 'image/jpeg',
    extension: 'jpeg',
    fileSize: 1536,
    properties: { width: 800, height: 600, bpp: 24, alpha: 0, lossless: 0 },
  },
};
export function tbrSetup(connect) {
  if (!customElements.get('tbr-thumb')) {
    customElements.define('tbr-thumb', class extends HTMLElement {
      static get observedAttributes() { return ['src']; }
    });
  }
  return { connect, verify: () => verifyConnect(connect), thumb: async () => RESULT };
}
export class Client {
  constructor(options) { this.connect = options.connect; }
  verify() { return verifyConnect(this.connect); }
  async thumb() { return RESULT; }
}
async function verifyConnect(connect) {
  if (connect.includes('unreachable')) throw new Error('Connect server not responding (404)');
  return {};
}
`;

const thumbnailSettings = (page: Page) =>
  page.getByRole('listitem').filter({ hasText: 'Thumbrella connect string' });

const iconCell = (row: ReturnType<Page['getByRole']>) => row.locator('td').nth(2);

async function withThumbrella(page: Page, connect: string) {
  await page.route('https://js.thumbrella.dev/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: STUB_MODULE })
  );
  await page.addInitScript((value) => {
    if (!localStorage.getItem('brows3-settings')) {
      localStorage.setItem('brows3-settings', JSON.stringify({ state: { thumbrellaConnect: value }, version: 0 }));
    }
  }, connect);
}

test('configured Thumbrella replaces file icons with thumbnails and keeps row height', async ({ page, backend }) => {
  await withThumbrella(page, 'https://thumbrella.test');
  await page.goto(bucketUrl);

  const thumbnails = page.locator('tbr-thumb');
  await expect(thumbnails.first()).toBeVisible();
  await expect(thumbnails).toHaveCount(2);
  await expect(thumbnails.first()).toHaveAttribute('src', /^https:\/\/media\.brows3\.test\//);
  expect(backend.calls.some((call) => call.command === 'get_presigned_url')).toBe(true);

  const box = await thumbnails.first().boundingBox();
  expect(box?.width).toBe(32);
  expect(box?.height).toBeCloseTo(25.6, 1);
  expect(await thumbnails.first().evaluate((node) => getComputedStyle(node).filter)).toMatch(/contrast\(1\.2\)/);

  // Folders keep their icon, and no row grows taller than a folder row.
  const folderRow = page.getByRole('row').filter({ hasText: 'nested/' });
  const fileRow = page.getByRole('row').filter({ hasText: 'notes.txt' });
  expect(await iconCell(folderRow).locator('svg').count()).toBe(1);
  expect(await iconCell(fileRow).locator('tbr-thumb').count()).toBe(1);
  const folderHeight = (await folderRow.boundingBox())?.height ?? 0;
  const fileHeight = (await fileRow.boundingBox())?.height ?? 0;
  expect(fileHeight).toBeLessThanOrEqual(folderHeight);
});

test('hovering a thumbnail shows the full-size preview with result metadata', async ({ page }) => {
  await withThumbrella(page, 'https://thumbrella.test');
  await page.goto(bucketUrl);

  const thumbnail = page.locator('tbr-thumb').first();
  await expect(thumbnail).toBeVisible();
  await thumbnail.hover();

  const tooltip = page.locator('.MuiTooltip-tooltip');
  await expect(tooltip).toBeVisible();

  const preview = tooltip.locator('tbr-thumb');
  const box = await preview.boundingBox();
  expect(box).toEqual({ x: expect.any(Number), y: expect.any(Number), width: 250, height: 200 });

  // The card sits clear of the file name column instead of covering it.
  const thumbnailBox = await thumbnail.boundingBox();
  expect((box?.x ?? 0) - ((thumbnailBox?.x ?? 0) + (thumbnailBox?.width ?? 0))).toBeGreaterThanOrEqual(190);

  await expect(tooltip).toContainText('Image · JPEG');
  await expect(tooltip).toContainText('800 × 600 px');
  await expect(tooltip).toContainText('1.5 KB');
  await expect(tooltip).toContainText('image/jpeg');
  await expect(tooltip).toContainText('24-bit');
  await expect(tooltip).not.toContainText('Thumbnail');
});

test('hovering the file name or extension shows the same preview', async ({ page }) => {
  await withThumbrella(page, 'https://thumbrella.test');
  await page.goto(bucketUrl);

  const tooltip = page.locator('.MuiTooltip-tooltip');
  const fileRow = page.getByRole('row').filter({ hasText: 'notes.txt' });

  await fileRow.getByText('notes.txt', { exact: true }).hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('800 × 600 px');

  await page.getByText('TXT', { exact: true }).first().hover();
  await expect(tooltip).toBeVisible();
});

test('the preview dialog lists details and falls back to the thumbnail', async ({ page, backend }) => {
  backend.objects.push({ key: 'archive.zip', size: 4096, last_modified: '2026-01-01T00:00:00Z', storage_class: 'STANDARD' });
  backend.contentType = 'application/zip';
  await withThumbrella(page, 'https://thumbrella.test');
  await page.goto(bucketUrl);

  const row = page.getByRole('row').filter({ hasText: 'archive.zip' });
  await row.getByTitle('Preview', { exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('tbr-thumb')).toHaveCount(1);
  await expect(dialog.getByRole('complementary', { name: 'File details' })).toContainText('Image · JPEG');
  await expect(dialog).toContainText('This object is not previewable in the app. Please download it to inspect locally.');
  await expect(dialog.getByRole('button', { name: 'Previous file' })).toHaveCount(0);
});

test('load errors still show the thumbnail when there is nothing else to render', async ({ page, backend }) => {
  backend.objects.push({ key: 'photo.heic', size: 8192, last_modified: '2026-01-01T00:00:00Z', storage_class: 'STANDARD' });
  backend.contentError = 'Invalid content: This object appears to contain binary data and cannot be edited safely in the text editor. Download it to inspect locally.';
  await withThumbrella(page, 'https://thumbrella.test');
  await page.goto(bucketUrl);

  await page.getByRole('row').filter({ hasText: 'photo.heic' }).getByTitle('Preview', { exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('tbr-thumb')).toHaveCount(1);
  await expect(dialog).toContainText('Invalid content: This object appears to contain binary data');
  await expect(dialog.getByRole('complementary', { name: 'File details' })).toContainText('Image · JPEG');
});

test('raw image formats stay in the standard preview instead of a blank full-screen viewer', async ({ page, backend }) => {
  backend.objects.push({ key: 'IMG_0042.CR2', size: 25165824, last_modified: '2026-01-01T00:00:00Z', storage_class: 'STANDARD' });
  backend.contentType = 'image/x-canon-cr2';
  await withThumbrella(page, 'https://thumbrella.test');
  await page.goto(bucketUrl);

  await page.getByRole('row').filter({ hasText: 'IMG_0042.CR2' }).getByTitle('Preview', { exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('tbr-thumb')).toHaveCount(1);
  await expect(dialog).toContainText('This image format cannot be displayed in the app.');
  await expect(dialog.getByRole('complementary', { name: 'File details' })).toContainText('Image · JPEG');
  await expect(page.getByRole('region', { name: 'Image viewport' })).toHaveCount(0);
});

test('Thumbrella stays off until a connect string is applied', async ({ page }) => {
  await withThumbrella(page, '');
  await page.goto(bucketUrl);

  await expect(page.getByRole('checkbox', { name: 'Select notes.txt', exact: true })).toBeVisible();
  await expect(page.locator('tbr-thumb')).toHaveCount(0);

  await page.getByText('Settings', { exact: true }).first().click();
  await thumbnailSettings(page).getByLabel('Connect string').fill('https://thumbrella.test');
  await thumbnailSettings(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Thumbnails are streaming from https://thumbrella.test.')).toBeVisible();

  await page.goto(bucketUrl);
  await expect(page.locator('tbr-thumb')).toHaveCount(2);
});

test('a rejected connect string keeps the previous configuration', async ({ page }) => {
  await withThumbrella(page, 'https://thumbrella.test');
  await page.goto('/settings');

  const settings = thumbnailSettings(page);
  await expect(settings.getByLabel('Connect string')).toHaveValue('https://thumbrella.test');
  await settings.getByLabel('Connect string').fill('https://unreachable.test');
  await settings.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Connect server not responding (404)')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('brows3-settings') || '{}').state.thumbrellaConnect)).toBe('https://thumbrella.test');
});

