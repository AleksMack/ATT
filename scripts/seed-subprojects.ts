/**
 * Seeds subprojects from tab "6. Projects & Subprojects" through the API.
 *
 *   npm run seed:subprojects               first subproject only (current check mode)
 *   npm run seed:subprojects -- --limit 50 all subprojects
 *
 * One subproject per row: name = Subproject Name (Country/City), code = Subproject ID,
 * startDate = Start Date of the row ("YYYY-MM-DD"), parentId = id of the project whose code is
 * the Project ID. A subproject whose parent project is not in the system is not created.
 *
 * Loads the subprojects of each parent once and creates only the missing ones (same parent +
 * name = exists, not updated). Tab 6 subproject columns are cleared and re-marked green / red,
 * "Subproject seed status"; the project columns are left as they are.
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { apiLogin } from '../api/auth';
import { ApiClient } from '../api/client';
import { ProjectsApi, type CreateProjectRequest, type Project, type ProjectEnsureResult } from '../api/projects';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet, toIsoDate } from './master-data/workbook';

const SHEET = '6. Projects & Subprojects';
const JSON_FILE = 'data/master/subprojects.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Project ID');
  const items = rows.map((row) => ({
    key: row['Subproject ID'],
    projectId: row['Project ID'],
    name: row['Subproject Name (Country/City)'],
    startDate: toIsoDate(row['Start Date']),
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limitArg(1));

  await apiLogin();
  const api = await ApiClient.create();
  const projects = new ProjectsApi(api);
  const results: { key: string; result: ProjectEnsureResult }[] = [];
  try {
    const parents = new Map((await projects.listAll()).map((p) => [p.code, p.id]));
    const requests: { key: string; request: CreateProjectRequest }[] = [];
    for (const item of selected) {
      const request: CreateProjectRequest = {
        name: item.name,
        code: item.key,
        startDate: item.startDate,
        parentId: parents.get(item.projectId),
      };
      const error =
        request.parentId === undefined
          ? `parent project ${item.projectId} is not in the system`
          : !item.startDate
            ? 'Start Date is empty or not a date'
            : undefined;
      if (error) {
        results.push({ key: item.key, result: { request, status: 'error', error } });
        continue;
      }
      requests.push({ key: item.key, request });
    }
    const ensured = await projects.ensureAllSubprojects(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (s: Project) => ({ name: s.name, startDate: s.startDate, parentId: s.parentId }));
  console.log(`Subprojects processed: ${results.length} of ${items.length}.`);

  updateIdMap('subprojects', idsOf(results));

  await markRows(SHEET, 'Project ID', toStatuses(results), {
    keyHeader: 'Subproject ID',
    statusHeader: 'Subproject seed status',
    colorHeaders: ['Subproject ID', 'Subproject Name (Country/City)'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
