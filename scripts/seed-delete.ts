/**
 * Deletes from the system every record that matches a row of the master data workbook,
 * so `npm run seed:all` can be run again on a filled environment:
 *
 *   npm run seed:delete                                   dry run: prints what would be deleted
 *   npm run seed:delete -- --confirm                      deletes
 *   npm run seed:delete -- --confirm --only ports,terminals
 *
 * Records are found exactly as the seeds find them: every seed runs in map-only mode first
 * (as `npm run seed:map`: nothing created, workbook untouched) and rebuilds the id map from
 * scratch. Everything in that map is deleted, including records that were in the system before
 * the first seed (created by hand). Other records are not touched.
 *
 * Children go first (reverse seed order; subprojects go with their projects). Banks are kept:
 * the API cannot delete them (the team deletes them in the database). A record that cannot be deleted (e.g. used by a deal)
 * is reported and the run goes on. Deleted keys are removed from the id map; the workbook is
 * not changed. Runs only on the environments in ALLOWED_ENVIRONMENTS.
 */
import 'dotenv/config';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { ApiClient } from '../api/client';
import { ClientAccountsApi } from '../api/clientAccounts';
import { ClientsApi } from '../api/clients';
import { EscalationsApi } from '../api/escalations';
import { LegalFormsApi } from '../api/legalForms';
import { PhysicalCharacteristicsApi } from '../api/physicalCharacteristics';
import { PortsApi } from '../api/ports';
import { ProductsApi } from '../api/products';
import { ProjectsApi } from '../api/projects';
import { ResourcesApi } from '../api/resources';
import { ShippersApi } from '../api/shippers';
import { TerminalsApi } from '../api/terminals';
import { VesselsApi } from '../api/vessels';
import { mapLimit, SEED_CONCURRENCY } from '../utils/concurrency';
import { environmentName, forgetIds, idMapPath, readIdMap, type IdMapResource } from '../utils/idMap';

/** Environments where deleting the master data is allowed. */
const ALLOWED_ENVIRONMENTS = ['uat'];

type Deleter = (api: ApiClient) => Promise<(id: number) => Promise<void>>;

/**
 * Reverse seed order: children before their parents. Subprojects have no step: the subproject
 * list has no lock token, and deleting a project deletes its subprojects (confirmed by the team).
 * Banks have no step: the API and the UI do not delete banks (errorCode 70); the team deletes
 * them in the database.
 */
const ORDER: { resource: IdMapResource; deleter: Deleter }[] = [
  { resource: 'projects', deleter: async (api) => (id) => new ProjectsApi(api).deleteById(id) },
  { resource: 'resources', deleter: async (api) => (id) => new ResourcesApi(api).deleteById(id) },
  { resource: 'terminals', deleter: async (api) => (id) => new TerminalsApi(api).deleteById(id) },
  { resource: 'ports', deleter: async (api) => (id) => new PortsApi(api).deleteById(id) },
  { resource: 'vessels', deleter: async (api) => (id) => new VesselsApi(api).deleteById(id) },
  { resource: 'clientAccounts', deleter: async (api) => (id) => new ClientAccountsApi(api).deleteById(id) },
  { resource: 'clients', deleter: async (api) => (id) => new ClientsApi(api).deleteById(id) },
  { resource: 'legalForms', deleter: async (api) => (id) => new LegalFormsApi(api).deleteById(id) },
  { resource: 'shippers', deleter: async (api) => (id) => new ShippersApi(api).deleteById(id) },
  { resource: 'escalations', deleter: async (api) => (id) => new EscalationsApi(api).deleteById(id) },
  { resource: 'subproducts', deleter: async (api) => (id) => new ProductsApi(api).deleteById(id) },
  { resource: 'products', deleter: async (api) => (id) => new ProductsApi(api).deleteById(id) },
  { resource: 'characteristics', deleter: async (api) => (id) => new PhysicalCharacteristicsApi(api).deleteById(id) },
];

function onlyArg(): Set<string> | undefined {
  const i = process.argv.indexOf('--only');
  return i > 0 ? new Set(process.argv[i + 1].split(',').map((s) => s.trim())) : undefined;
}

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm');
  const only = onlyArg();
  const environment = environmentName();
  if (!ALLOWED_ENVIRONMENTS.includes(environment)) {
    throw new Error(`Deleting master data is allowed only on ${ALLOWED_ENVIRONMENTS.join(', ')}, not on "${environment}".`);
  }
  const unknown = [...(only ?? [])].filter((name) => !ORDER.some((step) => step.resource === name));
  if (unknown.length) throw new Error(`Unknown --only resources: ${unknown.join(', ')}. Known: ${ORDER.map((s) => s.resource).join(', ')}`);

  // Fresh map: match every workbook row in the system, as seed:map does (set before the seeds load)
  console.log('Matching workbook rows in the system (map only, nothing created)...');
  fs.rmSync(idMapPath(), { force: true });
  process.env.SEED_MAP_ONLY = '1';
  const { runSeeds } = await import('./master-data/seeds');
  await runSeeds();
  const map = readIdMap();

  await ensureApiSession();
  const api = await ApiClient.create();
  const summary: string[] = [];
  try {
    for (const { resource, deleter } of ORDER) {
      if (only && !only.has(resource)) continue;
      const entries = Object.entries(map.resources[resource] ?? {});
      // Several rows can share one record (e.g. shippers with the same name)
      const ids = [...new Set(entries.map(([, id]) => id))];
      if (!confirm) {
        summary.push(`${resource.padEnd(16)} would delete ${ids.length}`);
        continue;
      }
      const remove = await deleter(api);
      const errors = new Map<number, string>();
      await mapLimit(ids, SEED_CONCURRENCY, async (id) => {
        try {
          await remove(id);
        } catch (error) {
          errors.set(id, (error as Error).message);
        }
      });
      // uat fails some parallel deletes with HTTP 500 errorCode 1 ("Общая техническая ошибка"):
      // some of them pass when sent again, others were deleted anyway. So the failed ones are
      // retried one by one, and "not found" (errorCode 1000) on the retry means deleted.
      for (const id of [...errors.keys()]) {
        try {
          await remove(id);
          errors.delete(id);
        } catch (error) {
          if (/errorCode 1000\b/.test((error as Error).message)) errors.delete(id);
          else errors.set(id, (error as Error).message);
        }
      }
      forgetIds(resource, entries.filter(([, id]) => !errors.has(id)).map(([key]) => key));
      for (const [id, error] of errors) {
        const keys = entries.filter(([, entryId]) => entryId === id).map(([key]) => key);
        console.log(`ERROR    ${resource} ${keys.join(', ')} (id ${id}): ${error}`);
      }
      summary.push(`${resource.padEnd(16)} deleted ${ids.length - errors.size} of ${ids.length}`);
      if (resource === 'projects' && !errors.size) {
        forgetIds('subprojects', Object.keys(map.resources.subprojects ?? {}));
        summary.push(`${'subprojects'.padEnd(16)} deleted with their projects`);
      }
    }
  } finally {
    await api.dispose();
  }
  console.log(`\n${confirm ? 'Deleted' : 'Dry run, nothing deleted (add -- --confirm)'} on ${environment}:\n${summary.join('\n')}`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
