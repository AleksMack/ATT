/**
 * Seeds legal forms from tab "1. Counterparties" through the API.
 *
 *   npm run seed:legal-forms               first legal form only (current check mode)
 *   npm run seed:legal-forms -- --limit 14 all legal forms
 *
 * The tab lists counterparties; each has a legal form. One legal form per distinct
 * Legal Form (ENG): name = abbreviation = Legal Form (ENG),
 * name_RUS = abbreviation_RUS = Legal Form (RUS) (not "Name (RUS)", which is the counterparty's name).
 *
 * Loads the list once and creates only the missing legal forms (same name = exists, not updated).
 * Tab 1 legal form columns are cleared and re-marked green / red in every counterparty row with
 * that legal form, "Legal form seed status".
 */
import 'dotenv/config';
import fs from 'fs';
import { apiLogin } from '../api/auth';
import { ApiClient } from '../api/client';
import { LegalFormsApi, type CreateLegalFormRequest, type LegalForm, type LegalFormEnsureResult } from '../api/legalForms';
import { limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '1. Counterparties';
const JSON_FILE = 'data/master/legal-forms.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Counterparty ID');

  const items: { key: string; request: CreateLegalFormRequest }[] = [];
  for (const row of rows) {
    const eng = row['Legal Form (ENG)'];
    const rus = row['Legal Form (RUS)'];
    if (!eng || items.some((item) => item.key === eng)) continue;
    items.push({ key: eng, request: { name: eng, abbreviation: eng, name_RUS: rus, abbreviation_RUS: rus } });
  }
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items.map((i) => i.request), null, 2)}\n`);
  const selected = items.slice(0, limitArg(1));

  await apiLogin();
  const api = await ApiClient.create();
  let results: { key: string; result: LegalFormEnsureResult }[];
  try {
    const ensured = await new LegalFormsApi(api).ensureAll(selected.map((item) => item.request));
    results = ensured.map((result, i) => ({ key: selected[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (f: LegalForm) => ({
    name: f.name,
    abbreviation: f.abbreviation,
    name_RUS: f.name_RUS,
    abbreviation_RUS: f.abbreviation_RUS,
  }));
  console.log(`Legal forms processed: ${results.length} of ${items.length}.`);

  // Rows are matched by their legal form, so every counterparty with it is marked
  await markRows(SHEET, 'Counterparty ID', toStatuses(results), {
    keyHeader: 'Legal Form (ENG)',
    statusHeader: 'Legal form seed status',
    colorHeaders: ['Legal Form (ENG)', 'Legal Form (RUS)'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
