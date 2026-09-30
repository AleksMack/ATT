/**
 * Seeds resources (refineries, oil fields, depots, ...) from tab "13. Resources" through the API.
 *
 *   npm run seed:resources                first resource only (current check mode)
 *   npm run seed:resources -- --limit 50  all resources
 *
 * name = Resource Name, unlocode = UN/LOCODE (of the resource's port), countryId by Country/Region,
 * cityId by the Port Name, as for ports (the tab has no city; a resource is located at its port),
 * sanctionStatuses = [SANCTIONED] for Status "Restricted" (none in the tab now), left out otherwise.
 * Not sent: Resource Type, Terminal, Status, Notes (not in the example request).
 *
 * Resources are matched by name (unique in the tab): existing ones are not created or updated.
 * Tab 13 is cleared and re-marked: Resource ID and Resource Name green / red, "Seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import { mapLimit, SEED_CONCURRENCY } from '../utils/concurrency';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { ApiClient } from '../api/client';
import { GeoApi } from '../api/geo';
import { SANCTIONED } from '../api/ports';
import { ResourcesApi, type CreateResourceRequest, type Resource, type ResourceEnsureResult } from '../api/resources';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '13. Resources';
const JSON_FILE = 'data/master/resources.json';

export async function main(limit = limitArg(1)): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Resource ID');
  const items = rows.map((row) => ({
    key: row['Resource ID'],
    name: row['Resource Name'],
    unlocode: row['UN/LOCODE'],
    port: row['Port Name'],
    country: row['Country/Region'],
    status: row['Status'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limit);

  await ensureApiSession();
  const api = await ApiClient.create();
  const results: { key: string; result: ResourceEnsureResult }[] = [];
  const cityNotes = new Map<string, string>();
  try {
    const geo = new GeoApi(api);
    // Geo lookups in parallel first; the loop below then reads them from the GeoApi cache
    await mapLimit(selected, SEED_CONCURRENCY, async (item) => {
      const countryId = await geo.countryId(item.country);
      if (countryId !== undefined) await geo.cityFromName(countryId, item.port);
    });
    const requests: { key: string; request: CreateResourceRequest }[] = [];
    for (const item of selected) {
      const request: CreateResourceRequest = {
        name: item.name,
        unlocode: item.unlocode,
        ...(item.status === 'Restricted' ? { sanctionStatuses: [SANCTIONED] } : {}),
        countryId: 0,
        cityId: 0,
      };
      const countryId = await geo.countryId(item.country);
      const city = countryId === undefined ? undefined : await geo.cityFromName(countryId, item.port);
      if (countryId === undefined || !city) {
        const error = countryId === undefined ? `country "${item.country}" not found` : `country "${item.country}" has no cities`;
        results.push({ key: item.key, result: { request, status: 'error', error } });
        continue;
      }
      if (city.match !== 'exact') {
        cityNotes.set(item.key, `city "${item.port}" (port) not found, used ${city.match === 'closest' ? 'closest' : 'first of country'}: "${city.name}"`);
      }
      requests.push({ key: item.key, request: { ...request, countryId, cityId: city.id } });
    }
    const ensured = await new ResourcesApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (r: Resource) => ({ name: r.name }));
  for (const [key, note] of cityNotes) console.log(`NOTE     ${key}  ${note}`);
  console.log(`Resources processed: ${results.length} of ${items.length}.`);

  const statuses = toStatuses(results);
  for (const [key, note] of cityNotes) {
    const status = statuses.get(key);
    if (status) status.text = `${status.text}; ${note}`;
  }
  updateIdMap('resources', idsOf(results));

  await markRows(SHEET, 'Resource ID', statuses, {
    colorHeaders: ['Resource ID', 'Resource Name'],
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
