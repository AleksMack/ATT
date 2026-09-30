/**
 * Clears all seed marks in the workbook, then runs every seed with all its records in
 * dependency order, in one process:
 *
 *   npm run seed:all
 *
 * Stops at the first seed that fails. SEED_CONCURRENCY sets how many creates run at a time.
 */
import 'dotenv/config';
import { main as clearMarks } from './clear-seed-marks';
import { runSeeds } from './master-data/seeds';

async function main(): Promise<void> {
  await clearMarks();
  await runSeeds();
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
