import type { ApiClient, PagedList } from './client';
import { ensureAllByName, ensureOne, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET physicalcharacteristics/list and getbyid (Swagger: FullCharacteristic). */
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

export type CharacteristicEnsureResult = EnsureResult<CreatePhysicalCharacteristicRequest, PhysicalCharacteristic>;

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

  listAll(): Promise<PhysicalCharacteristic[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
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

  /** Loads the full list once and creates only the missing records (see ensureAllByName). */
  async ensureAll(requests: CreatePhysicalCharacteristicRequest[]): Promise<CharacteristicEnsureResult[]> {
    return ensureAllByName(await this.listAll(), requests, (request) => this.create(request));
  }

  ensure(request: CreatePhysicalCharacteristicRequest): Promise<{ record: PhysicalCharacteristic; created: boolean }> {
    return ensureOne((requests) => this.ensureAll(requests), request);
  }
}
