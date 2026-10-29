#!/usr/bin/env node
/**
 * Turns the full-size project photos into small, web-ready WebP files.
 *
 *   npm run images                       → reads "../Bay Design Images For Website/" (next to the project)
 *   npm run images -- "<other folder>"   → reads another folder of photos
 *
 * Each photo is saved at 480, 960, 1600 and 2400px wide (never larger than the original) as
 * public/images/photos/<name>-<width>.webp. src/lib/photos.ts gives the browser all four,
 * so a phone downloads the small one and a large desktop screen the big one.
 * Photos already converted are skipped; delete their files to redo them.
 */
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const WIDTHS = [480, 960, 1600, 2400];
const QUALITY = 72;
/** The photo used for public/images/og.jpg, the picture shown when someone shares a link to the site. */
const OG_PHOTO = 'bay-hdr-13';
// The full-size originals live beside the project (Desktop), not inside it.
const sourceDir = path.resolve(process.argv[2] ?? '../Bay Design Images For Website');
const outDir = path.resolve('public/images/photos');

/** "Stefania Pifferi - BAY DESIGN -12001.jpg" → "bay-12001", "Stefania Pifferi_HDR_7.jpg" → "bay-hdr-7" */
function slug(file) {
  const base = path.parse(file).name;
  const hdr = base.match(/HDR[_ -]*(\d+)$/i);
  if (hdr) return `bay-hdr-${hdr[1]}`;
  const num = base.match(/(\d+)$/);
  return num ? `bay-${num[1]}` : base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

await mkdir(outDir, { recursive: true });
const files = (await readdir(sourceDir)).filter((f) => /\.(jpe?g|png|tiff?|webp)$/i.test(f));
const manifest = {};
let before = 0;
let after = 0;

for (const file of files) {
  const name = slug(file);
  const input = path.join(sourceDir, file);
  before += (await stat(input)).size;
  // EXIF rotation is applied first so portrait shots stay upright.
  const meta = await sharp(input).rotate().metadata();
  const portrait = (meta.orientation ?? 1) >= 5;
  const width = portrait ? meta.height : meta.width;
  const height = portrait ? meta.width : meta.height;
  // Every width is always written (a small original is just never enlarged) so the site can count on all four.
  for (const w of WIDTHS) {
    const out = path.join(outDir, `${name}-${w}.webp`);
    if (!existsSync(out)) {
      await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: QUALITY, effort: 5 }).toFile(out);
    }
    after += (await stat(out)).size;
  }
  manifest[name] = { width, height };
  console.log(`${file} → ${name}`);
}

await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Link previews (Facebook, iMessage, LinkedIn …) want a 1200×630 JPEG.
const og = path.join(sourceDir, files.find((f) => slug(f) === OG_PHOTO) ?? '');
if (files.some((f) => slug(f) === OG_PHOTO)) {
  await sharp(og).rotate().resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.resolve('public/images/og.jpg'));
}
const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`\n${files.length} photos: ${mb(before)} MB of originals → ${mb(after)} MB of WebP (all sizes together)`);
