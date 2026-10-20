// Runs SQL on the ENKOP master database (your Supabase project) through the Management API.
//   node master-db/scripts/sql.mjs <file.sql>
//   node master-db/scripts/sql.mjs --query "select count(*) from properties"
import { readFileSync } from 'node:fs';
import { sql } from './lib.mjs';

const [flag, value] = process.argv.slice(2);
const query = flag === '--query' ? value : flag ? readFileSync(flag, 'utf8') : null;
if (!query) {
  console.error('usage: sql.mjs <file.sql> | --query "<sql>"');
  process.exit(1);
}
try {
  console.log(JSON.stringify(await sql(query), null, 2));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
