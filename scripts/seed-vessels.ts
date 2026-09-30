/**
 * Seeds vessels from tab "4. Tankers - Vessels" through the API.
 *
 *   npm run seed:vessels                first vessel only (current check mode)
 *   npm run seed:vessels -- --limit 50  all vessels
 *
 * name = Vessel Name, imoNumber = digits of "MO #" ("IMO 9241853" -> 9241853), mmsiNumber = MMSI #,
 * dwt = Capacity (DWT), flagStateId = country id of Flag / Flag State, isCollector = Storage is "Yes",
 * ownerId / operatorId: Owner ID / Operator ID -> Name (ENG) in tab 1 -> legalName in clients/list -> id.
 * Not sent: Type / Vessel Type, Sanction Status, Status, Built.
 * A vessel whose owner, operator or flag cannot be linked is not created.
 *
 * The natural key is the IMO number: loads the list once and creates only the missing vessels
 * (not updated). Tab 4 is cleared and re-marked: Vessel ID and Vessel Name green / red, "Seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import { mapLimit, SEED_CONCURRENCY } from '../utils/concurrency';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { ApiClient } from '../api/client';
import { ClientsApi } from '../api/clients';
import { GeoApi } from '../api/geo';
import { VesselsApi, type CreateVesselRequest, type Vessel, type VesselEnsureResult } from '../api/vessels';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '4. Tankers - Vessels';
const JSON_FILE = 'data/master/vessels.json';

export async function main(limit = limitArg(1)): Promise<void> {
  assertWorkbookWritable();
  const counterparties = new Map((await readSheet('1. Counterparties', 'Counterparty ID')).map((r) => [r['Counterparty ID'], r['Name (ENG)']]));
  const rows = await readSheet(SHEET, 'Vessel ID');
  const items = rows.map((row) => ({
    key: row['Vessel ID'],
    name: row['Vessel Name'],
    imo: row['MO #'].replace(/\D/g, ''),
    mmsi: row['MMSI #'],
    dwt: row['Capacity (DWT)'],
    flag: row['Flag / Flag State'],
    storage: row['Storage'],
    ownerId: row['Owner ID'],
    operatorId: row['Operator ID'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limit);

  await ensureApiSession();
  const api = await ApiClient.create();
  const results: { key: string; result: VesselEnsureResult }[] = [];
  try {
    const clientIds = new Map((await new ClientsApi(api).listAll()).map((c) => [c.legalName, c.id]));
    const geo = new GeoApi(api);
    // Counterparty ID -> id in the system, or an error text
    const link = (counterpartyId: string, role: string): number | string => {
      const name = counterparties.get(counterpartyId);
      if (!name) return `${role} ${counterpartyId} is not in tab 1`;
      return clientIds.get(name) ?? `${role} ${counterpartyId} "${name}" is not in the system`;
    };

    // Geo lookups in parallel first; the loop below then reads them from the GeoApi cache
    await mapLimit(selected, SEED_CONCURRENCY, (item) => geo.countryId(item.flag));
    const requests: { key: string; request: CreateVesselRequest }[] = [];
    for (const item of selected) {
      const owner = link(item.ownerId, 'owner');
      const operator = link(item.operatorId, 'operator');
      const flagStateId = await geo.countryId(item.flag);
      const request: CreateVesselRequest = {
        name: item.name,
        imoNumber: Number(item.imo),
        mmsiNumber: Number(item.mmsi),
        ownerId: typeof owner === 'number' ? owner : 0,
        operatorId: typeof operator === 'number' ? operator : 0,
        flagStateId: flagStateId ?? 0,
        isCollector: item.storage.toLowerCase() === 'yes',
        dwt: Number(item.dwt),
      };
      const error =
        typeof owner === 'string'
          ? owner
          : typeof operator === 'string'
            ? operator
            : flagStateId === undefined
              ? `flag "${item.flag}" is not a country in the system`
              : !/^\d{7}$/.test(item.imo)
                ? `IMO "${item.imo}" is not 7 digits`
                : undefined;
      if (error) {
        results.push({ key: item.key, result: { request, status: 'error', error } });
        continue;
      }
      requests.push({ key: item.key, request });
    }
    const ensured = await new VesselsApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (v: Vessel) => ({
    name: v.name,
    imoNumber: v.imoNumber,
    mmsiNumber: v.mmsiNumber,
    ownerId: v.ownerId,
    operatorId: v.operatorId,
    flagStateId: v.flagStateId,
    isCollector: v.isCollector,
    dwt: v.dwt,
  }));
  console.log(`Vessels processed: ${results.length} of ${items.length}.`);

  updateIdMap('vessels', idsOf(results));

  await markRows(SHEET, 'Vessel ID', toStatuses(results), {
    colorHeaders: ['Vessel ID', 'Vessel Name'],
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
