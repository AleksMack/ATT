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

/** Countries and cities (English names) from geoobjectsearch. Results are cached per run. */
export class GeoApi {
  private readonly countries = new Map<string, number | undefined>();

  constructor(private readonly api: ApiClient) {}

  /** Country id by exact English name, or undefined. */
  async countryId(name: string): Promise<number | undefined> {
    if (!this.countries.has(name)) {
      const page = await this.api.getData<PagedList<GeoItem>>('geoobjectsearch/countrylisteng', {
        'FilterData.Name': name,
        PageIndex: 0,
        PageSize: 50,
      });
      this.countries.set(name, page.records.find((c) => c.name === name)?.id);
    }
    return this.countries.get(name);
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

  private async cities(countryId: number, name?: string): Promise<GeoItem[]> {
    const page = await this.api.getData<PagedList<GeoItem>>('geoobjectsearch/citylisteng', {
      'FilterData.CountryId': countryId,
      ...(name ? { 'FilterData.Name': name } : {}),
      PageIndex: 0,
      PageSize: 50,
    });
    return page.records;
  }
}
