// DASH-D register (Cam 2026-11-01, "photo tiles"): an item's photo on its register tile.
//  1. the photo route: shop.catalog (the permission that edits the item), the course's own item only,
//     images only, 8MB, the agreement check, storage not set up → says so;
//  2. the list returns the photo; the tile shows it (lazy), and in a group with any photo every tile
//     gets the same picture area — the item's initials when it has none (letters and digits only);
//  3. the catalog uploads and removes it, and says what went wrong.
// Pure. Run: npx tsx scripts/register-photo-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const route = read('src/app/api/operator/shop-items/photo/route.ts');
ok('the route needs shop.catalog and the current agreement', route.includes("requirePermission(session, 'shop.catalog')") && route.includes('requireAgreementCurrent(session.courseId)'));
ok('it only touches this course\'s item', route.includes('prisma.shopItem.findFirst({ where: { id, courseId }') && (route.match(/await itemOf\(/g) || []).length === 2);
ok('JPEG / PNG / WebP under 8MB only', route.includes("'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'") && route.includes('file.size > MAX_BYTES') && route.includes('8 * 1024 * 1024'));
ok('no storage token → a 503 that says who to contact', route.includes('BLOB_READ_WRITE_TOKEN') && route.includes('status: 503'));
ok('the schema column has a default (additive migration)', read('prisma/schema.prisma').includes('photoUrl    String             @default("")') && read('prisma/migrations/20261102110000_shop_item_photo/migration.sql').includes(`ADD COLUMN     "photoUrl" TEXT NOT NULL DEFAULT ''`));

ok('the item list returns the photo', read('src/lib/shop-catalog.ts').includes('photoUrl: true } as const;'));
const shop = read('src/app/dashboard/shop/page.tsx');
ok('the tile shows the photo, lazily', shop.includes('<img src={it.photoUrl} alt="" loading="lazy"'));
ok('a group with any photo gives every tile the same picture area', shop.includes('const withPhotos = list.some(i => i.photoUrl);') && shop.includes('{withPhotos && (it.photoUrl'));
const initials = (name: string) => name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
ok('initials skip punctuation ("Tees (bag of 50)" → TO, never "T(")', initials('Tees (bag of 50)') === 'TO' && initials('Pro V1') === 'PV' && shop.includes(".filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2)"));

const cat = read('src/components/dashboard/ShopCatalog.tsx');
ok('a phone photo is shrunk before upload (Vercel refuses bodies over 4.5 MB)', cat.includes("fd.append('file', await downscaleImage(file));"));
ok('the catalog uploads and removes the photo, and shows the error', cat.includes("fetch('/api/operator/shop-items/photo', { method: 'POST', body: fd })") && cat.includes("method: 'DELETE'") && cat.includes("onError(d.error || 'Upload failed — try again.')") && cat.includes('{canEdit && <ItemPhoto'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
