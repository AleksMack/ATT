import type { ApiClient, PagedList } from './client';
import { deleteById, ensureAllByKey, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET terminals/list and getbyid. */
export interface Terminal {
  id: number;
  name: string;
  portId?: number;
  lock?: { token: string; isLocked: boolean };
}

/**
 * Swagger: CreateUpdateTerminalRequest (the fields used by the seed), plus countryId, which the
 * example request sends although Swagger does not list it. Country and city are the port's.
 */
export interface CreateTerminalRequest {
  name: string;
  portId: number;
  countryId: number;
  cityId: number;
  addressLine: string;
}

export type TerminalEnsureResult = EnsureResult<CreateTerminalRequest, Terminal>;

const BASE = 'terminals';

/** Reference data: terminals of ports. */
export class TerminalsApi {
  constructor(private readonly api: ApiClient) {}

  list(pageIndex = 0, pageSize = 100): Promise<PagedList<Terminal>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize });
  }

  listAll(): Promise<Terminal[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<Terminal> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  /** Deletes by id (reads the lock token with getbyid first). */
  deleteById(id: number): Promise<void> {
    return deleteById(this.api, `${BASE}/getbyid`, `${BASE}/delete`, id);
  }

  /** Sends the create request only and returns the new record's id. */
  async createId(request: CreateTerminalRequest): Promise<number> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return id;
  }

  async create(request: CreateTerminalRequest): Promise<Terminal> {
    return this.getById(await this.createId(request));
  }

  async delete(record: Pick<Terminal, 'id'> & { lock: { token: string } }): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Terminals are matched by name (unique in the workbook). */
  async ensureAll(requests: CreateTerminalRequest[]): Promise<TerminalEnsureResult[]> {
    return ensureAllByKey(await this.listAll(), requests, (item) => item.name, {
      create: (request) => this.createId(request),
      reload: () => this.listAll(),
    });
  }
}
