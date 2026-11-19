// Copies the PWA sources from ../hsk-app into ./www so Capacitor can bundle them.
// Tests, package files and the service worker are left out: the APK ships files directly.
import { cp, rm, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../hsk-app');
const dest = path.resolve(here, '../www');

const EXCLUDE = new Set(['tests', 'tools', 'package.json', 'package-lock.json', 'node_modules', 'sw.js']);

if (!existsSync(src)) {
  console.error(`Không thấy thư mục nguồn: ${src}`);
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
for (const entry of await readdir(src)) {
  if (EXCLUDE.has(entry)) continue;
  await cp(path.join(src, entry), path.join(dest, entry), { recursive: true });
}
console.log(`Đã sao chép ${src} → ${dest}`);
