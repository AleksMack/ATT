import type { ApiClient, PagedList } from './client';
import { ensureAllByKey, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET vessels/list and getbyid. */
export interface Vessel {
  id: number;
  name: string;
  imoNumber: number;
  mmsiNumber?: number;
  ownerId?: number;
  operatorId?: number;
  flagStateId?: number;
  dwt?: number;
  isCollector: boolean;
  lock?: { token: string; isLocked: boolean };
}

/** Swagger: CreateUpdateVesselRequest (the fields used by the seed; vesselType is not set). */
export interface CreateVesselRequest {
  name: string;
  imoNumber: number;
  mmsiNumber: number;
  /** Counterparty (clients) id */
  ownerId: number;
  /** Counterparty (clients) id */
  operatorId: number;
  /** Country id */
  flagStateId: number;
  isCollector: boolean;
  dwt: number;
}

export type VesselEnsureResult = EnsureResult<CreateVesselRequest, Vessel>;

const BASE = 'vessels';

/** Reference data "Справочники → Логистика → Суда". */
export class VesselsApi {
  constructor(private readonly api: ApiClient) {}

  list(pageIndex = 0, pageSize = 100): Promise<PagedList<Vessel>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize });
  }

  listAll(): Promise<Vessel[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<Vessel> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  async create(request: CreateVesselRequest): Promise<Vessel> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return this.getById(id);
  }

  async delete(record: Pick<Vessel, 'id'> & { lock: { token: string } }): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only vessels whose IMO number is not there yet. */
  async ensureAll(requests: CreateVesselRequest[]): Promise<VesselEnsureResult[]> {
    return ensureAllByKey(await this.listAll(), requests, (item) => String(item.imoNumber), (request) => this.create(request));
  }
}
