/**
 * Seeds escalations from tab "10. Escalations" through the API.
 *
 *   npm run seed:escalations                first escalation only (current check mode)
 *   npm run seed:escalations -- --limit 50  all escalations
 *
 * name = Escalation Name, comment = Notes,
 * escalationType = 3 for Direction "Above", 2 for "Below" (values given by the team),
 * priceIncrease = true for Type "Penalty", false for "Premium" and "Rejection",
 * productCharacteristicId = id of the characteristic: Characteristic ID -> tab 7 name -> id in the system,
 * defaultTop = false, defaultStep = null. Value / Threshold is not sent.
 * One workbook row = one escalation (key: name + characteristic + comment, see api/escalations.ts).
 * Tab 10 is cleared and re-marked: Escalation ID and Escalation Name green / red, "Seed status".
 */
import 'dotenv/config';
import fs from 'fs';
import { apiLogin } from '../api/auth';
import { ApiClient } from '../api/client';
import { EscalationsApi, type CreateEscalationRequest, type Escalation, type EscalationEnsureResult } from '../api/escalations';
import { loadCharacteristicLinks } from './master-data/characteristicLinks';
import { limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '10. Escalations';
const JSON_FILE = 'data/master/escalations.json';
// Given by the team: Above -> 3, Below -> 2 (the user/dictionary escalationTypes names differ)
const DIRECTIONS: Record<string, number> = { Above: 3, Below: 2 };
const TYPES: Record<string, boolean> = { Penalty: true, Premium: false, Rejection: false };

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Escalation ID');
  const items = rows.map((row) => ({
    key: row['Escalation ID'],
    name: row['Escalation Name'],
    type: row['Type'],
    direction: row['Direction'],
    characteristicId: row['Characteristic ID'],
    characteristicName: row['Characteristic'],
    comment: row['Notes'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limitArg(1));

  await apiLogin();
  const api = await ApiClient.create();
  const results: { key: string; result: EscalationEnsureResult }[] = [];
  try {
    const link = await loadCharacteristicLinks(api);
    const requests: { key: string; request: CreateEscalationRequest }[] = [];
    for (const item of selected) {
      const characteristic = link(item.characteristicId, item.characteristicName);
      const request: CreateEscalationRequest = {
        name: item.name,
        escalationType: DIRECTIONS[item.direction] ?? -1,
        productCharacteristicId: characteristic.ok ? characteristic.ref.id : 0,
        defaultTop: false,
        defaultStep: null,
        priceIncrease: TYPES[item.type] ?? false,
        comment: item.comment,
      };
      const error = !characteristic.ok
        ? characteristic.error
        : !(item.direction in DIRECTIONS)
          ? `Direction "${item.direction}" is not Above or Below`
          : !(item.type in TYPES)
            ? `Type "${item.type}" is not Penalty, Premium or Rejection`
            : undefined;
      if (error) {
        results.push({ key: item.key, result: { request, status: 'error', error } });
        continue;
      }
      requests.push({ key: item.key, request });
    }
    const ensured = await new EscalationsApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (e: Escalation) => ({
    name: e.name,
    escalationType: e.escalationType,
    productCharacteristicId: e.productCharacteristicId,
    priceIncrease: e.priceIncrease,
    comment: e.comment,
  }));
  console.log(`Escalations processed: ${results.length} of ${items.length}.`);

  await markRows(SHEET, 'Escalation ID', toStatuses(results), {
    colorHeaders: ['Escalation ID', 'Escalation Name'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
