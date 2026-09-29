/**
 * Seeds banks from tab "2. Banks" through the API.
 *
 *   npm run seed:banks                first bank only (current check mode)
 *   npm run seed:banks -- --limit 30  all banks
 *
 * nameRus = Name (RUS), nameEng = Name (ENG), abbreviation = Short Name / Abbreviation,
 * swiftBic = SWIFT/BIC, inn = Tax ID (INN), street = Street, building = Building/Block,
 * useForSendingOriginals = false, countryId by Country (exact English name),
 * cityId by City/Locality: exact name, else the first search result, else the first city
 * of the country (the choice is written to the status column).
 *
 * The natural key is SWIFT/BIC: a bank with the same SWIFT/BIC exists -> not created, not updated.
 * Tab 2 is cleared and re-marked: Bank ID and names green / red, "Seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { BanksApi, type Bank, type BankEnsureResult, type CreateBankRequest } from '../api/banks';
import { ApiClient } from '../api/client';
import { GeoApi } from '../api/geo';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '2. Banks';
const JSON_FILE = 'data/master/banks.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Bank ID');
  const items = rows.map((row) => ({
    key: row['Bank ID'],
    nameRus: row['Name (RUS)'],
    nameEng: row['Name (ENG)'],
    abbreviation: row['Short Name / Abbreviation'],
    swiftBic: row['SWIFT/BIC'],
    inn: row['Tax ID (INN)'],
    country: row['Country'],
    city: row['City/Locality'],
    street: row['Street'],
    building: row['Building/Block'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limitArg(1));

  await ensureApiSession();
  const api = await ApiClient.create();
  const results: { key: string; result: BankEnsureResult }[] = [];
  const cityNotes = new Map<string, string>();
  try {
    const geo = new GeoApi(api);
    const requests: { key: string; request: CreateBankRequest }[] = [];
    for (const item of selected) {
      const { key, country, city: cityName, ...fields } = item;
      const request = { ...fields, countryId: 0, cityId: 0, useForSendingOriginals: false };
      const countryId = await geo.countryId(country);
      const city = countryId === undefined ? undefined : await geo.city(countryId, cityName);
      if (countryId === undefined || !city) {
        const error = countryId === undefined ? `country "${country}" not found` : `country "${country}" has no cities`;
        results.push({ key, result: { request, status: 'error', error } });
        continue;
      }
      if (city.match !== 'exact') {
        cityNotes.set(key, `city "${cityName}" not found, used ${city.match === 'closest' ? 'closest' : 'first of country'}: "${city.name}"`);
      }
      requests.push({ key, request: { ...request, countryId, cityId: city.id } });
    }
    const ensured = await new BanksApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (b: Bank) => ({ nameEng: b.nameEng, swiftBic: b.swiftBic, countryName: b.countryName }));
  for (const [key, note] of cityNotes) console.log(`NOTE     ${key}  ${note}`);
  console.log(`Banks processed: ${results.length} of ${items.length}.`);

  const statuses = toStatuses(results);
  for (const [key, note] of cityNotes) {
    const status = statuses.get(key);
    if (status) status.text = `${status.text}; ${note}`;
  }
  updateIdMap('banks', idsOf(results));

  await markRows(SHEET, 'Bank ID', statuses, {
    colorHeaders: ['Bank ID', 'Name (ENG)', 'Name (RUS)'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
