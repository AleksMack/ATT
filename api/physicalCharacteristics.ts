import type { ApiClient, PagedList } from './client';

/** Record of GET physicalcharacteristics/list and getbyid (Swagger leaves the response untyped). */
export interface PhysicalCharacteristic {
  id: number;
  name: string;
  comment?: string;
  isSystem: boolean;
  type: number;
  densityKind: number;
  lock: { token: string; isLocked: boolean };
}

/** Swagger: CreateUpdatePhysicalCharacteristicRequest. */
export interface CreatePhysicalCharacteristicRequest {
  name: string;
  comment?: string;
}

export type EnsureResult =
  | { request: CreatePhysicalCharacteristicRequest; status: 'created' | 'exists'; record: PhysicalCharacteristic }
  | { request: CreatePhysicalCharacteristicRequest; status: 'error'; error: string };

const BASE = 'physicalcharacteristics';

/** Longer names are rejected with errorCode 1, message "Name" (found by testing; not in Swagger). */
export const CHARACTERISTIC_NAME_MAX_LENGTH = 20;

/** errorCode for a failed field validation; the message holds the field name. */
export const VALIDATION_ERROR = 1;

/** Reference data "Справочники → Трейдинг → Характеристики". */
export class PhysicalCharacteristicsApi {
  constructor(private readonly api: ApiClient) {}

  /** One page, sorted by name. */
  list(pageIndex = 0, pageSize = 100): Promise<PagedList<PhysicalCharacteristic>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize, SortColumn: 'name' });
  }

  /** All records, page by page until totalRecordsCount is reached. */
  async listAll(pageSize = 100): Promise<PhysicalCharacteristic[]> {
    const records: PhysicalCharacteristic[] = [];
    for (let pageIndex = 0; ; pageIndex++) {
      const page = await this.list(pageIndex, pageSize);
      records.push(...page.records);
      if (page.records.length === 0 || records.length >= page.totalRecordsCount) {
        return records;
      }
    }
  }

  /** Records whose name is exactly `name`. */
  async findByName(name: string): Promise<PhysicalCharacteristic[]> {
    return (await this.listAll()).filter((record) => record.name === name);
  }

  getById(id: number): Promise<PhysicalCharacteristic> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  async create(request: CreatePhysicalCharacteristicRequest): Promise<PhysicalCharacteristic> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return this.getById(id);
  }

  /** Delete needs the record's lock token. */
  async delete(record: Pick<PhysicalCharacteristic, 'id' | 'lock'>): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /**
   * Reference data rule: if a record with the same name exists, reuse it and do not create
   * a duplicate. Existing records are not updated.
   * Loads the full list once, compares names exactly, then creates only the missing ones.
   */
  /** A failed create does not stop the batch: it is returned with status "error". */
  async ensureAll(requests: CreatePhysicalCharacteristicRequest[]): Promise<EnsureResult[]> {
    const byName = new Map((await this.listAll()).map((record) => [record.name, record]));
    const results: EnsureResult[] = [];
    for (const request of requests) {
      const existing = byName.get(request.name);
      if (existing) {
        results.push({ request, status: 'exists', record: existing });
        continue;
      }
      try {
        const record = await this.create(request);
        byName.set(record.name, record);
        results.push({ request, status: 'created', record });
      } catch (error) {
        results.push({ request, status: 'error', error: (error as Error).message });
      }
    }
    return results;
  }

  /** One record; throws if it cannot be created. */
  async ensure(
    request: CreatePhysicalCharacteristicRequest,
  ): Promise<{ record: PhysicalCharacteristic; created: boolean }> {
    const [result] = await this.ensureAll([request]);
    if (result.status === 'error') {
      throw new Error(result.error);
    }
    return { record: result.record, created: result.status === 'created' };
  }
}
