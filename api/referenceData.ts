import type { PagedList } from './client';

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

/**
 * Reference data rule (docs/test-strategy.md, 5.3): if a record with the same name exists,
 * reuse it and do not create a duplicate; existing records are not updated.
 * `existing` is the full list loaded once; names are compared exactly.
 * A failed create does not stop the batch: it is returned with status "error".
 */
export async function ensureAllByName<Req extends { name: string }, Rec extends { name: string }>(
  existing: Rec[],
  requests: Req[],
  create: (request: Req) => Promise<Rec>,
): Promise<EnsureResult<Req, Rec>[]> {
  return ensureAllByKey(existing, requests, (x) => x.name, create);
}

/** Same as ensureAllByName, with a custom natural key (e.g. parent id + name for subproducts). */
export async function ensureAllByKey<Req, Rec>(
  existing: Rec[],
  requests: Req[],
  key: (item: Req | Rec) => string,
  create: (request: Req) => Promise<Rec>,
): Promise<EnsureResult<Req, Rec>[]> {
  const byKey = new Map(existing.map((record) => [key(record), record]));
  const results: EnsureResult<Req, Rec>[] = [];
  for (const request of requests) {
    const found = byKey.get(key(request));
    if (found) {
      results.push({ request, status: 'exists', record: found });
      continue;
    }
    // Map-only mode (npm run seed:map): report the record as missing instead of creating it
    if (process.env.SEED_MAP_ONLY === '1') {
      results.push({ request, status: 'error', error: 'not in the system (map only, nothing created)' });
      continue;
    }
    try {
      const record = await create(request);
      byKey.set(key(record), record);
      results.push({ request, status: 'created', record });
    } catch (error) {
      results.push({ request, status: 'error', error: (error as Error).message });
    }
  }
  return results;
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
