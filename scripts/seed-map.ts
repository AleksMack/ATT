/**
 * Builds the id map of the current environment without changing anything:
 *
 *   npm run seed:map
 *
 * Runs every seed in map-only mode (SEED_MAP_ONLY=1), in one process: records are matched exactly
 * as in a normal seed, nothing is created and the workbook is not touched; the ids of the records
 * found in the system are written to data/master/id-map.<env>.json (see utils/idMap.ts).
 * Use it after the environment changed or was reset, or when the data was loaded another way.
 */
import 'dotenv/config';
import { idMapPath, readIdMap } from '../utils/idMap';

async function main(): Promise<void> {
  // Set before the seeds are loaded: report.ts reads it once at import
  process.env.SEED_MAP_ONLY = '1';
  const { runSeeds } = await import('./master-data/seeds');
  await runSeeds();

  const map = readIdMap();
  console.log(`\n${idMapPath()}:`);
  for (const [resource, ids] of Object.entries(map.resources)) console.log(`  ${resource.padEnd(16)} ${Object.keys(ids ?? {}).length} keys`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
