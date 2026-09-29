/**
 * Seeds counterparties (API resource "clients") from tab "1. Counterparties".
 *
 *   npm run seed:clients                first counterparty only (current check mode)
 *   npm run seed:clients -- --limit 50  all counterparties
 *
 * legalName = Name (ENG), abbreviation = Abbreviation, legalNameRu = Name (RUS),
 * legalFormId = id of the legal form named Legal Form (ENG), legalFormAbbreviationRUS = Legal Form (RUS),
 * tin = INN, vatCode = VAT Code, certificateNumber = Registration Certificate No.,
 * counterpartyKind = 1 if Group Company is "Yes", else 0; counterpartyTypes = [1], kycStatus = 0,
 * creditLimit = 0, role = 0, useForSendingOriginals = true;
 * countryId / cityId as for banks (city: exact, else closest search result, else first of country).
 * A counterparty whose legal form or country is not in the system is not created.
 *
 * Loads the list once and creates only the missing counterparties (same legal name = exists,
 * not updated). Tab 1 counterparty columns are cleared and re-marked, "Counterparty seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { apiLogin } from '../api/auth';
import { ApiClient } from '../api/client';
import { ClientsApi, type Client, type ClientEnsureResult, type CreateClientRequest } from '../api/clients';
import { GeoApi } from '../api/geo';
import { LegalFormsApi } from '../api/legalForms';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '1. Counterparties';
const JSON_FILE = 'data/master/clients.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Counterparty ID');
  const items = rows.map((row) => ({
    key: row['Counterparty ID'],
    legalName: row['Name (ENG)'],
    legalForm: row['Legal Form (ENG)'],
    legalFormRus: row['Legal Form (RUS)'],
    abbreviation: row['Abbreviation'],
    groupCompany: row['Group Company'],
    legalNameRu: row['Name (RUS)'],
    tin: row['INN'],
    vatCode: row['VAT Code'],
    certificateNumber: row['Registration Certificate No.'],
    country: row['Country'],
    city: row['City/Locality'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limitArg(1));

  await apiLogin();
  const api = await ApiClient.create();
  const results: { key: string; result: ClientEnsureResult }[] = [];
  const cityNotes = new Map<string, string>();
  try {
    const legalForms = new Map((await new LegalFormsApi(api).listAll()).map((f) => [f.name, f.id]));
    const geo = new GeoApi(api);
    const requests: { key: string; request: CreateClientRequest }[] = [];
    for (const item of selected) {
      const request: CreateClientRequest = {
        counterpartyKind: item.groupCompany.toLowerCase() === 'yes' ? 1 : 0,
        counterpartyTypes: [1],
        legalName: item.legalName,
        legalFormId: legalForms.get(item.legalForm) ?? 0,
        abbreviation: item.abbreviation,
        legalNameRu: item.legalNameRu,
        legalFormAbbreviationRUS: item.legalFormRus,
        tin: item.tin,
        vatCode: item.vatCode,
        certificateNumber: item.certificateNumber,
        kycStatus: 0,
        creditLimit: 0,
        countryId: 0,
        cityId: 0,
        useForSendingOriginals: true,
        role: 0,
      };
      const countryId = await geo.countryId(item.country);
      const city = countryId === undefined ? undefined : await geo.city(countryId, item.city);
      const error = !legalForms.has(item.legalForm)
        ? `legal form "${item.legalForm}" is not in the system`
        : countryId === undefined
          ? `country "${item.country}" not found`
          : !city
            ? `country "${item.country}" has no cities`
            : undefined;
      if (error || countryId === undefined || !city) {
        results.push({ key: item.key, result: { request, status: 'error', error: error ?? 'unknown' } });
        continue;
      }
      if (city.match !== 'exact') {
        cityNotes.set(item.key, `city "${item.city}" not found, used ${city.match === 'closest' ? 'closest' : 'first of country'}: "${city.name}"`);
      }
      requests.push({ key: item.key, request: { ...request, countryId, cityId: city.id } });
    }
    const ensured = await new ClientsApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (c: Client) => ({
    legalName: c.legalName,
    abbreviation: c.abbreviation,
    counterpartyKind: c.counterpartyKind,
    counterpartyTypes: c.counterpartyTypes,
    kycStatus: c.kycStatus,
  }));
  for (const [key, note] of cityNotes) console.log(`NOTE     ${key}  ${note}`);
  console.log(`Counterparties processed: ${results.length} of ${items.length}.`);

  const statuses = toStatuses(results);
  for (const [key, note] of cityNotes) {
    const status = statuses.get(key);
    if (status) status.text = `${status.text}; ${note}`;
  }
  updateIdMap('clients', idsOf(results));

  await markRows(SHEET, 'Counterparty ID', statuses, {
    statusHeader: 'Counterparty seed status',
    colorHeaders: ['Counterparty ID', 'Name (ENG)'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
