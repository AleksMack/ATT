/**
 * Builds the id map of the current environment without changing anything:
 *
 *   npm run seed:map
 *
 * Runs every seed script in map-only mode (SEED_MAP_ONLY=1): records are matched exactly as in
 * a normal seed, nothing is created and the workbook is not touched; the ids of the records
 * found in the system are written to data/master/id-map.<env>.json (see utils/idMap.ts).
 * Use it after the environment changed or was reset, or when the data was loaded another way.
 */
import 'dotenv/config';
import { spawnSync } from 'child_process';
import { idMapPath, readIdMap } from '../utils/idMap';

/** Dependency order, the same as `npm run seed:all`. */
const SEEDS = [
  'seed-characteristics',
  'seed-products',
  'seed-subproducts',
  'seed-escalations',
  'seed-shippers',
  'seed-banks',
  'seed-legal-forms',
  'seed-clients',
  'seed-client-accounts',
  'seed-vessels',
  'seed-ports',
  'seed-resources',
  'seed-projects',
  'seed-subprojects',
];

for (const seed of SEEDS) {
  // One command string: npx needs a shell on Windows, and fixed arguments need no escaping
  const run = spawnSync(`npx tsx scripts/${seed}.ts --limit 100000`, {
    env: { ...process.env, SEED_MAP_ONLY: '1' },
    encoding: 'utf8',
    shell: true,
  });
  // Only the totals: every record line is printed by the seed itself
  const totals = run.stdout
    .split('\n')
    .filter((line) => /^(Created|CREATED|EXISTS|ERROR):|^Created: /.test(line))
    .map((line) => line.trim())
    .join(' ');
  console.log(`${seed.padEnd(22)} ${run.status === 0 ? totals : `FAILED: ${run.stderr.trim().split('\n')[0]}`}`);
}

const map = readIdMap();
console.log(`\n${idMapPath()}:`);
for (const [resource, ids] of Object.entries(map.resources)) console.log(`  ${resource.padEnd(16)} ${Object.keys(ids ?? {}).length} keys`);
