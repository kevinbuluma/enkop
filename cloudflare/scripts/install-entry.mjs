// Copies cloudflare/entry.mjs next to the Nitro build so wrangler can deploy it as the master's entry.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const target = `${root}.output/server/enkop-entry.mjs`;
if (!existsSync(`${root}.output/server/index.mjs`)) {
  console.error('No .output/server/index.mjs; run `npm run build` first.');
  process.exit(1);
}
copyFileSync(`${root}cloudflare/entry.mjs`, target);
console.log(`Installed ${target}`);
