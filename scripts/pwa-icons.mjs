#!/usr/bin/env node
// PWA install (Cam 2026-11-24): the dashboard and admin home-screen icons, made from the brand mark
// (public/brand/mark.svg) so they never drift from it. Run by hand after the mark changes:
//   node scripts/pwa-icons.mjs
// Writes public/pwa/icon-192.png, icon-512.png and icon-maskable-512.png. The maskable one shrinks the mark into
// the central safe zone (a circle 80% of the width) on the mark's own green, so a round or squircle mask never
// cuts it. Uses the pre-installed Playwright Chromium; nothing here runs in the app or the build.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// require, not import: the machine-wide Playwright is found through NODE_PATH, which ESM imports ignore.
const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/brand/mark.svg'), 'utf8');
const BG = (svg.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/) || [])[1];
if (!BG) throw new Error('mark.svg: no background rect fill found');

const OUT = join(root, 'public/pwa');
mkdirSync(OUT, { recursive: true });

// scale: the share of the icon the mark's own square takes. 1 = full bleed (the mark already has its margin).
const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.88 },
];

const browser = await chromium.launch();
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
    const inner = Math.round(icon.size * icon.scale);
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${icon.size}px;height:${icon.size}px;background:${BG};display:flex;align-items:center;justify-content:center">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await page.screenshot({ path: join(OUT, icon.file), omitBackground: false });
    await page.close();
    console.log('wrote public/pwa/' + icon.file);
  }
} finally {
  await browser.close();
}
