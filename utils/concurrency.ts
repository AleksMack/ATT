/**
 * How many API requests a seed sends at the same time (creates, geo lookups).
 * SEED_CONCURRENCY in .env or the environment overrides it; 1 runs everything one by one.
 */
export const SEED_CONCURRENCY = Math.max(1, Number(process.env.SEED_CONCURRENCY) || 5);

/**
 * Runs `fn` for every item with at most `limit` calls at a time and returns the results in the
 * order of `items`. `fn` should catch its own errors: the first rejection rejects the whole call
 * while the other calls go on.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
