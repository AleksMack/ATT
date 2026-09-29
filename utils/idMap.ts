import fs from 'fs';
import { requireEnv } from './env';

/**
 * Map of workbook keys to ids in the system, one file per environment:
 * data/master/id-map.<env>.json, e.g. { "resources": { "clients": { "CP-042": 41 } } }.
 *
 * Written by the seed scripts (every record that is in the system after a run) and by
 * `npm run seed:map` (read-only). The system stays the source of truth: ids change when records
 * are recreated or the environment is reset, so the file is regenerated, never edited by hand.
 * Gitignored: it is specific to an environment.
 */
export type IdMapResource =
  | 'characteristics'
  | 'products'
  | 'subproducts'
  | 'escalations'
  | 'shippers'
  | 'banks'
  | 'legalForms'
  | 'clients'
  | 'clientAccounts'
  | 'vessels'
  | 'ports'
  | 'terminals'
  | 'resources'
  | 'projects'
  | 'subprojects';

interface IdMapFile {
  environment: string;
  baseUrl: string;
  updatedAt: string;
  resources: Partial<Record<IdMapResource, Record<string, number>>>;
}

/** Environment name = first part of the BASE_URL host ("https://uat.ctrm.biz" -> "uat"). */
export function environmentName(): string {
  return new URL(requireEnv('BASE_URL').BASE_URL).hostname.split('.')[0];
}

export function idMapPath(): string {
  return `data/master/id-map.${environmentName()}.json`;
}

export function readIdMap(): IdMapFile {
  const path = idMapPath();
  if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, 'utf8')) as IdMapFile;
  return { environment: environmentName(), baseUrl: requireEnv('BASE_URL').BASE_URL, updatedAt: '', resources: {} };
}

/** Merges ids into one resource section (keys not in `ids` are kept, so partial runs add up). */
export function updateIdMap(resource: IdMapResource, ids: Record<string, number>): void {
  const map = readIdMap();
  map.resources[resource] = { ...map.resources[resource], ...ids };
  map.updatedAt = new Date().toISOString();
  fs.writeFileSync(idMapPath(), `${JSON.stringify(map, null, 2)}\n`);
}

/** Removes keys that turned out to be wrong (e.g. the record was deleted). */
export function forgetIds(resource: IdMapResource, keys: string[]): void {
  const map = readIdMap();
  const section = { ...map.resources[resource] };
  for (const key of keys) delete section[key];
  map.resources[resource] = section;
  fs.writeFileSync(idMapPath(), `${JSON.stringify(map, null, 2)}\n`);
}

/**
 * Id of a workbook key, for tests: from the map if present, otherwise from `lookup`
 * (an API call), which is then saved to the map. Throws if neither finds it.
 */
export async function getId(
  resource: IdMapResource,
  key: string,
  lookup: () => Promise<number | undefined>,
): Promise<number> {
  const known = readIdMap().resources[resource]?.[key];
  if (known !== undefined) return known;
  const found = await lookup();
  if (found === undefined) {
    throw new Error(`${resource} ${key} is not in ${idMapPath()} and not found in the system; run npm run seed:map`);
  }
  updateIdMap(resource, { [key]: found });
  return found;
}
