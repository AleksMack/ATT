/**
 * Seeds shippers from tab "5. Shippers" through the API.
 *
 *   npm run seed:shippers              all rows
 *   npm run seed:shippers -- --limit 1 first row only
 *
 * Only Shipper Name is used: name = Shipper Name. The tab has one row per shipper and vessel,
 * so a name can repeat; the first row creates the shipper, the repeats get "exists" with the
 * same id. Loads the list once and creates only the missing shippers (same name = exists).
 * Tab 5 is cleared and re-marked: Shipper ID and Shipper Name green / red, "Seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { ApiClient } from '../api/client';
import { ShippersApi, type Shipper, type ShipperEnsureResult } from '../api/shippers';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '5. Shippers';
const JSON_FILE = 'data/master/shippers.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Shipper ID');
  const items = rows.map((row) => ({ key: row['Shipper ID'], name: row['Shipper Name'] }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limitArg(items.length));

  await ensureApiSession();
  const api = await ApiClient.create();
  let results: { key: string; result: ShipperEnsureResult }[];
  try {
    const ensured = await new ShippersApi(api).ensureAll(selected.map(({ name }) => ({ name })));
    results = ensured.map((result, i) => ({ key: selected[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (s: Shipper) => ({ name: s.name }));
  console.log(`Rows processed: ${results.length} of ${items.length}, distinct names: ${new Set(selected.map((i) => i.name)).size}.`);

  updateIdMap('shippers', idsOf(results));

  await markRows(SHEET, 'Shipper ID', toStatuses(results), {
    colorHeaders: ['Shipper ID', 'Shipper Name'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
