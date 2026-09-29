/**
 * Reads required keys from process.env (loaded from .env by playwright.config.ts).
 * Throws with the names of missing keys only, never with values.
 */
export function requireEnv<K extends string>(...keys: K[]): Record<K, string> {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing keys in .env: ${missing.join(', ')}`);
  }
  return Object.fromEntries(keys.map((key) => [key, process.env[key]!])) as Record<K, string>;
}
