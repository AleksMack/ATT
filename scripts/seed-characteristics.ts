/**
 * Seeds tab "7. Characteristics" of the master data workbook through the API.
 *
 *   npm run seed:characteristics
 *
 * 1. Reads the tab and rewrites data/master/characteristics.json
 *    (Characteristic Name -> name, Description -> comment).
 * 2. Loads the full list from the API once and creates only the missing records
 *    (a record with the same name is reused, not updated).
 * 3. Prints the result and marks the rows in the workbook: green = in the system
 *    (created now or already there), red = not created or error.
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { apiLogin } from '../api/auth';
import { ApiClient } from '../api/client';
import { PhysicalCharacteristicsApi, type CharacteristicEnsureResult as EnsureResult } from '../api/physicalCharacteristics';
import { assertWorkbookWritable, markRows, readSheet, type RowStatus } from './master-data/workbook';

const SHEET = '7. Characteristics';
const FIRST_HEADER = 'Characteristic ID';
const JSON_FILE = 'data/master/characteristics.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, FIRST_HEADER);
  const items = rows.map((row) => ({
    key: row['Characteristic ID'],
    name: row['Characteristic Name'],
    comment: row['Description'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);

  await apiLogin();
  const api = await ApiClient.create();
  let results: EnsureResult[];
  try {
    results = await new PhysicalCharacteristicsApi(api).ensureAll(items.map(({ name, comment }) => ({ name, comment })));
  } finally {
    await api.dispose();
  }

  // Local time, e.g. "2026-09-29 11:21"
  const runAt = new Date().toLocaleString('sv-SE').slice(0, 16);
  const statuses = new Map<string, RowStatus>();
  results.forEach((result, i) => {
    statuses.set(
      items[i].key,
      result.status === 'error'
        ? { ok: false, text: `error: ${result.error} (${runAt})` }
        : { ok: true, text: `${result.status}, id ${result.record.id} (${runAt})` },
    );
  });
  // Print first, so the result is shown even if the workbook is open in Excel
  print(items, results);
  updateIdMap(
    'characteristics',
    Object.fromEntries(results.flatMap((r, i) => (r.status === 'error' ? [] : [[items[i].key, r.record.id] as [string, number]]))),
  );
  await markRows(SHEET, FIRST_HEADER, statuses);
  console.log('Workbook updated: rows marked green (in the system) or red (not created).');
}

function print(items: { key: string; name: string }[], results: EnsureResult[]): void {
  for (const status of ['created', 'exists', 'error'] as const) {
    const group = results.map((result, i) => ({ result, item: items[i] })).filter(({ result }) => result.status === status);
    console.log(`\n${status.toUpperCase()}: ${group.length}`);
    for (const { item, result } of group) {
      const detail = result.status === 'error' ? result.error : `id ${result.record.id}`;
      console.log(`  ${item.key}  ${item.name.padEnd(30)} ${detail}`);
    }
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
