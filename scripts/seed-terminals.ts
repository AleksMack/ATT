/**
 * Seeds terminals from tab "15. Terminals" through the API. Needs the ports (seed:ports).
 *
 *   npm run seed:terminals                first terminal only (current check mode)
 *   npm run seed:terminals -- --limit 59  all terminals
 *
 * name = Terminal Name, addressLine = Notes,
 * portId: Port ID -> UN/LOCODE in tab 12 -> port in the system (logistic objects list),
 * countryId / cityId: those of the port in the system (ports/getbyid), so a terminal always has
 * its port's country and city. The Country of the row must be the port's country in tab 12.
 * Not sent: Terminal Type, Berths, Max Draft, Max Vessel Size, Storage Capacity, Products, Status.
 *
 * Terminals are matched by name: existing ones are not created or updated.
 * Tab 15 is cleared and re-marked: Terminal ID and Terminal Name green / red, "Seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { ApiClient } from '../api/client';
import { PortsApi, type Port } from '../api/ports';
import { TerminalsApi, type CreateTerminalRequest, type Terminal, type TerminalEnsureResult } from '../api/terminals';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '15. Terminals';
const JSON_FILE = 'data/master/terminals.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const portsInBook = new Map((await readSheet('12. Load & Unload Ports', 'Port ID')).map((r) => [r['Port ID'], r]));
  const rows = await readSheet(SHEET, 'Terminal ID');
  const items = rows.map((row) => ({
    key: row['Terminal ID'],
    name: row['Terminal Name'],
    portId: row['Port ID'],
    country: row['Country'],
    notes: row['Notes'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limitArg(1));

  await ensureApiSession();
  const api = await ApiClient.create();
  const results: { key: string; result: TerminalEnsureResult }[] = [];
  try {
    const ports = new PortsApi(api);
    const portsByCode = new Map((await ports.listAll()).map((p) => [p.unlocode, p]));
    const details = new Map<number, Port>();

    const requests: { key: string; request: CreateTerminalRequest }[] = [];
    for (const item of selected) {
      const request: CreateTerminalRequest = { name: item.name, portId: 0, countryId: 0, cityId: 0, addressLine: item.notes };
      const bookPort = portsInBook.get(item.portId);
      const port = bookPort && portsByCode.get(bookPort['UN/LOCODE']);
      if (port && !details.has(port.id)) details.set(port.id, await ports.getById(port.id));
      const detail = port && details.get(port.id);

      const error = !bookPort
        ? `${item.portId} is not in tab 12`
        : bookPort['Country/Region'] !== item.country
          ? `Country "${item.country}" differs from the port's "${bookPort['Country/Region']}" in tab 12`
          : !port
            ? `port ${item.portId} (${bookPort['UN/LOCODE']}) is not in the system`
            : !detail?.countryId || !detail?.cityId
              ? `port ${item.portId} (id ${port.id}) has no country or city in the system`
              : undefined;
      if (error || !port || !detail) {
        results.push({ key: item.key, result: { request, status: 'error', error: error ?? 'unknown' } });
        continue;
      }
      requests.push({
        key: item.key,
        request: { ...request, portId: port.id, countryId: detail.countryId!, cityId: detail.cityId! },
      });
    }
    const ensured = await new TerminalsApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (t: Terminal) => ({ name: t.name, portId: t.portId }));
  console.log(`Terminals processed: ${results.length} of ${items.length}.`);

  updateIdMap('terminals', idsOf(results));

  await markRows(SHEET, 'Terminal ID', toStatuses(results), {
    colorHeaders: ['Terminal ID', 'Terminal Name'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
