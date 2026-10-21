// Copies cloudflare/entry.mjs next to the Nitro build so wrangler can deploy it as the master's entry,
// and records the byte size of every video under public/videos so the entry can answer Range requests
// without first reading whole files.
import { copyFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const target = `${root}.output/server/enkop-entry.mjs`;
if (!existsSync(`${root}.output/server/index.mjs`)) {
  console.error('No .output/server/index.mjs; run `npm run build` first.');
  process.exit(1);
}
copyFileSync(`${root}cloudflare/entry.mjs`, target);

const publicDir = `${root}.output/public`;
const sizes = {};
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(mp4|webm)$/i.test(name)) sizes[`/${relative(publicDir, path).split('\\').join('/')}`] = statSync(path).size;
  }
};
walk(`${publicDir}/videos`);
writeFileSync(`${root}.output/server/enkop-video-sizes.mjs`, `export default ${JSON.stringify(sizes, null, 2)};\n`);
console.log(`Installed ${target} (${Object.keys(sizes).length} video sizes recorded)`);
