import type { EnsureResult } from '../../api/referenceData';
import type { RowStatus } from './workbook';

type Keyed<Req, Rec> = { key: string; result: EnsureResult<Req, Rec> };

/** Row statuses for markRows(): green = in the system (created or exists), red = error. */
export function toStatuses<Req, Rec extends { id: number }>(results: Keyed<Req, Rec>[]): Map<string, RowStatus> {
  // Local time, e.g. "2026-09-29 11:21"
  const runAt = new Date().toLocaleString('sv-SE').slice(0, 16);
  return new Map(
    results.map(({ key, result }) => [
      key,
      result.status === 'error'
        ? { ok: false, text: `error: ${result.error} (${runAt})` }
        : { ok: true, text: `${result.status}, id ${result.record.id} (${runAt})` },
    ]),
  );
}

/** Prints each result with the request sent and, if in the system, the record as stored. */
export function printResults<Req, Rec extends { id: number }>(
  results: Keyed<Req, Rec>[],
  describe: (record: Rec) => unknown,
): void {
  for (const { key, result } of results) {
    // Map-only mode (npm run seed:map) prints only the totals
    if (MAP_ONLY) break;
    const request = JSON.stringify(result.request);
    if (result.status === 'error') {
      console.log(`ERROR    ${key}  ${request}\n         ${result.error}`);
    } else {
      console.log(`${result.status.toUpperCase().padEnd(8)} ${key}  request: ${request}`);
      console.log(`         in system: id ${result.record.id}, ${JSON.stringify(describe(result.record))}`);
    }
  }
  const count = (status: string) => results.filter(({ result }) => result.status === status).length;
  console.log(`\nCreated: ${count('created')}, exists: ${count('exists')}, errors: ${count('error')}`);
}

/** Workbook key -> id for every record that is in the system (created or exists), for the id map. */
export function idsOf<Req, Rec extends { id: number }>(results: Keyed<Req, Rec>[]): Record<string, number> {
  return Object.fromEntries(
    results.flatMap(({ key, result }) => (result.status === 'error' ? [] : [[key, result.record.id] as [string, number]])),
  );
}

/**
 * Map-only mode (`npm run seed:map`): the seeds match records exactly as usual, but create
 * nothing and leave the workbook as it is; only the id map is written.
 */
export const MAP_ONLY = process.env.SEED_MAP_ONLY === '1';

/** --limit N from the command line, or `fallback`. */
export function limitArg(fallback: number): number {
  const i = process.argv.indexOf('--limit');
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}
