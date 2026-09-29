/**
 * Clears all seed marks in the master data workbook before a full run:
 *
 *   npm run seed:clear
 *
 * Removes the green / red fills and empties every "... seed status" column on all tabs,
 * so after `npm run seed:all` the workbook shows only that run.
 */
import { assertWorkbookWritable, clearAllMarks } from './master-data/workbook';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const { cells, statusColumns } = await clearAllMarks();
  console.log(`Workbook cleared: ${cells} colored cells, ${statusColumns} status columns emptied.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
