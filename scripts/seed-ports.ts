/**
 * Seeds ports from tab "12. Load & Unload Ports" through the API.
 *
 *   npm run seed:ports                first port only (current check mode)
 *   npm run seed:ports -- --limit 50  all ports
 *
 * name = Port Name, unlocode = UN/LOCODE, addressLine = Notes, countryId by Country/Region,
 * cityId by the port name (a port is usually named after its city; the text in brackets is tried
 * too, e.g. "Abu Dhabi (Mina Zayed)"; else the closest search result, else the first city of the
 * country), sanctionStatuses = [SANCTIONED] for Status "Restricted", left out for "Active" and
 * "Inactive".
 *
 * The natural key is the UN/LOCODE: ports already in the logistic objects list are not created
 * or updated. Tab 12 is cleared and re-marked: Port ID and Port Name green / red, "Seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import { mapLimit, SEED_CONCURRENCY } from '../utils/concurrency';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { ApiClient } from '../api/client';
import { GeoApi } from '../api/geo';
import { PortsApi, SANCTIONED, type CreatePortRequest, type Port, type PortEnsureResult } from '../api/ports';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '12. Load & Unload Ports';
const JSON_FILE = 'data/master/ports.json';

export async function main(limit = limitArg(1)): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Port ID');
  const items = rows.map((row) => ({
    key: row['Port ID'],
    name: row['Port Name'],
    unlocode: row['UN/LOCODE'],
    country: row['Country/Region'],
    status: row['Status'],
    notes: row['Notes'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limit);

  await ensureApiSession();
  const api = await ApiClient.create();
  const results: { key: string; result: PortEnsureResult }[] = [];
  const cityNotes = new Map<string, string>();
  try {
    const geo = new GeoApi(api);
    // Geo lookups in parallel first; the loop below then reads them from the GeoApi cache
    await mapLimit(selected, SEED_CONCURRENCY, async (item) => {
      const countryId = await geo.countryId(item.country);
      if (countryId !== undefined) await geo.cityFromName(countryId, item.name);
    });
    const requests: { key: string; request: CreatePortRequest }[] = [];
    for (const item of selected) {
      const request: CreatePortRequest = {
        name: item.name,
        unlocode: item.unlocode,
        ...(item.status === 'Restricted' ? { sanctionStatuses: [SANCTIONED] } : {}),
        countryId: 0,
        cityId: 0,
        addressLine: item.notes,
      };
      const countryId = await geo.countryId(item.country);
      const city = countryId === undefined ? undefined : await geo.cityFromName(countryId, item.name);
      if (countryId === undefined || !city) {
        const error = countryId === undefined ? `country "${item.country}" not found` : `country "${item.country}" has no cities`;
        results.push({ key: item.key, result: { request, status: 'error', error } });
        continue;
      }
      if (city.match !== 'exact') {
        cityNotes.set(item.key, `city "${item.name}" not found, used ${city.match === 'closest' ? 'closest' : 'first of country'}: "${city.name}"`);
      }
      requests.push({ key: item.key, request: { ...request, countryId, cityId: city.id } });
    }
    const ensured = await new PortsApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (p: Port) => ({ name: p.name, unlocode: p.unlocode }));
  for (const [key, note] of cityNotes) console.log(`NOTE     ${key}  ${note}`);
  console.log(`Ports processed: ${results.length} of ${items.length}.`);

  const statuses = toStatuses(results);
  for (const [key, note] of cityNotes) {
    const status = statuses.get(key);
    if (status) status.text = `${status.text}; ${note}`;
  }
  updateIdMap('ports', idsOf(results));

  await markRows(SHEET, 'Port ID', statuses, {
    colorHeaders: ['Port ID', 'Port Name'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

// Run directly (npm run seed:...), not when imported by seed-all or seed-map
if (require.main === module) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
