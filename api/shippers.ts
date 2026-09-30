import type { ApiClient, PagedList } from './client';
import { deleteById, ensureAllByName, ensureOne, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET shippers/list and getbyid. */
export interface Shipper {
  id: number;
  name: string;
  hasReplacementHistory: boolean;
  lock: { token: string; isLocked: boolean };
}

/** Swagger: CreateUpdateShipperRequest (id is not needed for create). */
export interface CreateShipperRequest {
  name: string;
}

export type ShipperEnsureResult = EnsureResult<CreateShipperRequest, Shipper>;

const BASE = 'shippers';

/** Reference data "Справочники → Другие → Грузоотправители". */
export class ShippersApi {
  constructor(private readonly api: ApiClient) {}

  /** One page, sorted by name. */
  list(pageIndex = 0, pageSize = 100): Promise<PagedList<Shipper>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize, SortColumn: 'name' });
  }

  listAll(): Promise<Shipper[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<Shipper> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  /** Deletes by id (reads the lock token with getbyid first). */
  deleteById(id: number): Promise<void> {
    return deleteById(this.api, `${BASE}/getbyid`, `${BASE}/delete`, id);
  }

  /** Sends the create request only and returns the new record's id. */
  async createId(request: CreateShipperRequest): Promise<number> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return id;
  }

  async create(request: CreateShipperRequest): Promise<Shipper> {
    return this.getById(await this.createId(request));
  }

  async delete(record: Pick<Shipper, 'id' | 'lock'>): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only the missing shippers (see ensureAllByName). */
  async ensureAll(requests: CreateShipperRequest[]): Promise<ShipperEnsureResult[]> {
    return ensureAllByName(await this.listAll(), requests, {
      create: (request) => this.createId(request),
      reload: () => this.listAll(),
    });
  }

  ensure(request: CreateShipperRequest): Promise<{ record: Shipper; created: boolean }> {
    return ensureOne((requests) => this.ensureAll(requests), request);
  }
}
