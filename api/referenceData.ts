import { mapLimit, SEED_CONCURRENCY } from '../utils/concurrency';
import type { ApiClient, PagedList } from './client';

/** Result of ensuring one reference record. */
export type EnsureResult<Req, Rec> =
  | { request: Req; status: 'created' | 'exists'; record: Rec }
  | { request: Req; status: 'error'; error: string };

/** Loads all pages of a list until totalRecordsCount is reached. */
export async function listAllPages<T>(fetchPage: (pageIndex: number) => Promise<PagedList<T>>): Promise<T[]> {
  const records: T[] = [];
  for (let pageIndex = 0; ; pageIndex++) {
    const page = await fetchPage(pageIndex);
    records.push(...page.records);
    if (page.records.length === 0 || records.length >= page.totalRecordsCount) {
      return records;
    }
  }
}

/** How ensureAllByKey creates records and gets them back. */
export interface EnsureOptions<Req, Rec> {
  /** Sends one create request and returns the new record's id. */
  create: (request: Req) => Promise<number>;
  /**
   * Loads the records again after the creates: one list call for the whole batch instead of a
   * getbyid per record. Called only if something was created.
   */
  reload: () => Promise<Rec[]>;
  /**
   * Other fields the system requires to be unique (e.g. escalation names, counterparty
   * abbreviations). Requests that share one of them, or the natural key, are sent one after
   * another in workbook order, so the same (later) row fails as in a serial run.
   */
  conflictKeys?: (request: Req) => string[];
}

/**
 * Reference data rule (docs/test-strategy.md, 5.3): if a record with the same name exists,
 * reuse it and do not create a duplicate; existing records are not updated.
 * `existing` is the full list loaded once; names are compared exactly.
 * A failed create does not stop the batch: it is returned with status "error".
 */
export async function ensureAllByName<Req extends { name: string }, Rec extends { id: number; name: string }>(
  existing: Rec[],
  requests: Req[],
  options: EnsureOptions<Req, Rec>,
): Promise<EnsureResult<Req, Rec>[]> {
  return ensureAllByKey(existing, requests, (x) => x.name, options);
}

/**
 * Same as ensureAllByName, with a custom natural key (e.g. parent id + name for subproducts).
 * Creates run in parallel (SEED_CONCURRENCY at a time); results keep the order of `requests`.
 */
export async function ensureAllByKey<Req, Rec extends { id: number }>(
  existing: Rec[],
  requests: Req[],
  key: (item: Req | Rec) => string,
  { create, reload, conflictKeys = () => [] }: EnsureOptions<Req, Rec>,
): Promise<EnsureResult<Req, Rec>[]> {
  const byKey = new Map(existing.map((record) => [key(record), record]));
  const createdIds = new Map<string, number>();
  type Pending = EnsureResult<Req, Rec> | { request: Req; status: 'created' | 'exists'; id: number };
  const pending: Pending[] = new Array(requests.length);

  const ensure = async (request: Req, index: number): Promise<void> => {
    const found = byKey.get(key(request));
    if (found) {
      pending[index] = { request, status: 'exists', record: found };
      return;
    }
    // Same key as an earlier row of this run: that row created it
    const createdId = createdIds.get(key(request));
    if (createdId !== undefined) {
      pending[index] = { request, status: 'exists', id: createdId };
      return;
    }
    // Map-only mode (npm run seed:map): report the record as missing instead of creating it
    if (process.env.SEED_MAP_ONLY === '1') {
      pending[index] = { request, status: 'error', error: 'not in the system (map only, nothing created)' };
      return;
    }
    try {
      const id = await create(request);
      createdIds.set(key(request), id);
      pending[index] = { request, status: 'created', id };
    } catch (error) {
      pending[index] = { request, status: 'error', error: (error as Error).message };
    }
  };

  // Each lane runs one after another; lanes run in parallel
  const lanes = groupByConflict(requests, (request) => [`key:${key(request)}`, ...conflictKeys(request)]);
  await mapLimit(lanes, SEED_CONCURRENCY, async (lane) => {
    for (const index of lane) await ensure(requests[index], index);
  });

  // uat sometimes answers a create with HTTP 500 errorCode 1 but stores the record anyway,
  // so after a failed create the reloaded list is checked for a record with that key
  const failed = pending.some((result) => result.status === 'error') && process.env.SEED_MAP_ONLY !== '1';
  const list = createdIds.size || failed ? await reload() : [];
  const reloaded = new Map(list.map((record) => [record.id, record]));
  const reloadedByKey = new Map(list.map((record) => [key(record), record]));
  return pending.map((result) => {
    if (result.status === 'error') {
      const stored = !byKey.has(key(result.request)) && reloadedByKey.get(key(result.request));
      return stored ? { request: result.request, status: 'created', record: stored } : result;
    }
    if (!('id' in result)) return result;
    const record = reloaded.get(result.id);
    return record
      ? { request: result.request, status: result.status, record }
      : { request: result.request, status: 'error', error: `created with id ${result.id}, but not found in the list after create` };
  });
}

/**
 * Groups request indexes so that requests sharing any conflict key are in one group,
 * each group in the order of `requests`.
 */
function groupByConflict<Req>(requests: Req[], keys: (request: Req) => string[]): number[][] {
  const parent = requests.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const owner = new Map<string, number>();
  requests.forEach((request, i) => {
    for (const k of keys(request)) {
      const other = owner.get(k);
      if (other === undefined) owner.set(k, i);
      else parent[root(i)] = root(other);
    }
  });
  const groups = new Map<number, number[]>();
  requests.forEach((_, i) => {
    const r = root(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  return [...groups.values()];
}

/** Single-record ensure; throws if the record cannot be created. */
export async function ensureOne<Req, Rec>(
  ensureAll: (requests: Req[]) => Promise<EnsureResult<Req, Rec>[]>,
  request: Req,
): Promise<{ record: Rec; created: boolean }> {
  const [result] = await ensureAll([request]);
  if (result.status === 'error') {
    throw new Error(result.error);
  }
  return { record: result.record, created: result.status === 'created' };
}

/**
 * Deletes a record by id. Delete requests need the record's lock token ({ id, token }),
 * so the record is read with getbyid first.
 */
export async function deleteById(api: ApiClient, getPath: string, deletePath: string, id: number): Promise<void> {
  const record = await api.getData<{ lock?: { token?: string } }>(getPath, { id });
  const token = record.lock?.token;
  if (!token) throw new Error(`${getPath}?id=${id} returned no lock token`);
  await api.postData(deletePath, { id, token });
}
