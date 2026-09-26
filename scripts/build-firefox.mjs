import { cpSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'dist');
const dest = resolve(root, 'dist-firefox');

// Remove stale hashed assets before copying the current build.
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true, force: true });

// Patch manifest
const manifestPath = resolve(dest, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Ensure gecko settings
if (!manifest.browser_specific_settings) {
  manifest.browser_specific_settings = { gecko: {} };
}
manifest.browser_specific_settings.gecko.strict_min_version = '128.0';

// Firefox requires data_collection_permissions inside gecko
manifest.browser_specific_settings.gecko.data_collection_permissions = {
  required: ['none'],
  optional: [],
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Firefox build ready at dist-firefox/');
