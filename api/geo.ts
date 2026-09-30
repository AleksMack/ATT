import type { ApiClient, PagedList } from './client';

interface GeoItem {
  id: number;
  name: string;
}

export interface CityMatch {
  id: number;
  name: string;
  /** exact: same name; closest: first search result; fallback: first city of the country. */
  match: 'exact' | 'closest' | 'fallback';
}

/** Countries and cities (English names) from geoobjectsearch. Every lookup is cached per run. */
export class GeoApi {
  // Promises, so parallel lookups of the same name send one request
  private readonly countries = new Map<string, Promise<number | undefined>>();
  private readonly cityLists = new Map<string, Promise<GeoItem[]>>();

  constructor(private readonly api: ApiClient) {}

  /** Country id by exact English name, or undefined. */
  countryId(name: string): Promise<number | undefined> {
    return cached(this.countries, name, async () => {
      const page = await this.api.getData<PagedList<GeoItem>>('geoobjectsearch/countrylisteng', {
        'FilterData.Name': name,
        PageIndex: 0,
        PageSize: 50,
      });
      return page.records.find((c) => c.name === name)?.id;
    });
  }

  /**
   * City in a country: the exact name if found; otherwise the first search result
   * (FilterData.Name matches by substring, like the first suggestion in the UI);
   * otherwise the first city of the country. Undefined only if the country has no cities.
   */
  async city(countryId: number, name: string): Promise<CityMatch | undefined> {
    const found = await this.cities(countryId, name);
    const exact = found.find((c) => c.name === name);
    if (exact) return { id: exact.id, name: exact.name, match: 'exact' };
    if (found[0]) return { id: found[0].id, name: found[0].name, match: 'closest' };
    const [first] = await this.cities(countryId);
    return first && { id: first.id, name: first.name, match: 'fallback' };
  }

  /**
   * City for a name that may carry a note in brackets, e.g. port names "Abu Dhabi (Mina Zayed)",
   * "Tashkent (rail terminal)", "Itaqui (São Luís)". Tries an exact match for the whole name,
   * the name without the brackets and the text inside them; then as city(): the first search
   * result for any of them, else the first city of the country.
   */
  async cityFromName(countryId: number, name: string): Promise<CityMatch | undefined> {
    const outside = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const inside = /\((.*?)\)/.exec(name)?.[1]?.trim();
    const candidates = [...new Set([name, outside, inside].filter((c): c is string => !!c))];
    const found = await Promise.all(candidates.map((candidate) => this.cities(countryId, candidate)));
    for (const [i, candidate] of candidates.entries()) {
      const exact = found[i].find((c) => c.name === candidate);
      if (exact) return { id: exact.id, name: exact.name, match: 'exact' };
    }
    const closest = found.find((list) => list.length > 0)?.[0];
    if (closest) return { id: closest.id, name: closest.name, match: 'closest' };
    const [first] = await this.cities(countryId);
    return first && { id: first.id, name: first.name, match: 'fallback' };
  }

  private cities(countryId: number, name?: string): Promise<GeoItem[]> {
    return cached(this.cityLists, `${countryId}/${name ?? ''}`, async () => {
      const page = await this.api.getData<PagedList<GeoItem>>('geoobjectsearch/citylisteng', {
        'FilterData.CountryId': countryId,
        ...(name ? { 'FilterData.Name': name } : {}),
        PageIndex: 0,
        PageSize: 50,
      });
      return page.records;
    });
  }
}

/** The cached promise for `key`, started with `load` on the first call. A failed lookup is not kept. */
function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let promise = cache.get(key);
  if (!promise) {
    promise = load();
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return promise;
}
