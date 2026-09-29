/**
 * Seeds projects (top level, no subprojects yet) from tab "6. Projects & Subprojects".
 *
 *   npm run seed:projects              first project only (current check mode)
 *   npm run seed:projects -- --limit 6 all projects
 *
 * One project per distinct Project ID (the tab repeats it for every subproject):
 *   name = Project Name (Region), code = Project ID,
 *   startDate = the earliest Start Date among the project's rows, as "YYYY-MM-DD".
 * Loads the list once and creates only the missing projects (same name = exists, not updated).
 * Tab 6 is cleared and re-marked: project columns green / red, "Project seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { ApiClient } from '../api/client';
import { ProjectsApi, type CreateProjectRequest, type Project, type ProjectEnsureResult } from '../api/projects';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet, toIsoDate } from './master-data/workbook';

const SHEET = '6. Projects & Subprojects';
const JSON_FILE = 'data/master/projects.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Project ID');

  const items: { key: string; request: CreateProjectRequest }[] = [];
  for (const row of rows) {
    const startDate = toIsoDate(row['Start Date']);
    const item = items.find((i) => i.key === row['Project ID']);
    if (!item) {
      items.push({ key: row['Project ID'], request: { name: row['Project Name (Region)'], code: row['Project ID'], startDate } });
    } else if (startDate && (!item.request.startDate || startDate < item.request.startDate)) {
      // "YYYY-MM-DD" strings compare in date order
      item.request.startDate = startDate;
    }
  }
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limitArg(1));

  await ensureApiSession();
  const api = await ApiClient.create();
  const results: { key: string; result: ProjectEnsureResult }[] = [];
  try {
    const valid = selected.filter((item) => {
      if (item.request.startDate) return true;
      results.push({ key: item.key, result: { request: item.request, status: 'error', error: 'Start Date is empty or not a date' } });
      return false;
    });
    const ensured = await new ProjectsApi(api).ensureAll(valid.map((item) => item.request));
    ensured.forEach((result, i) => results.push({ key: valid[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (p: Project) => ({ name: p.name, code: p.code, startDate: p.startDate }));
  console.log(`Projects processed: ${results.length} of ${items.length}.`);

  updateIdMap('projects', idsOf(results));

  await markRows(SHEET, 'Project ID', toStatuses(results), {
    statusHeader: 'Project seed status',
    colorHeaders: ['Project ID', 'Project Name (Region)'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
