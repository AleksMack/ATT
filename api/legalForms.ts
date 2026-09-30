import type { ApiClient, PagedList } from './client';
import { deleteById, ensureAllByName, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET legalforms/list and getbyid. */
export interface LegalForm {
  id: number;
  name: string;
  abbreviation: string;
  name_RUS: string;
  abbreviation_RUS: string;
  lock: { token: string; isLocked: boolean };
}

/** Swagger: CreateUpdateLegalFormRequest (id is not needed for create). */
export interface CreateLegalFormRequest {
  name: string;
  abbreviation: string;
  name_RUS: string;
  abbreviation_RUS: string;
}

export type LegalFormEnsureResult = EnsureResult<CreateLegalFormRequest, LegalForm>;

const BASE = 'legalforms';

/** Reference data "Справочники → Другие → Организационно-правовые формы". */
export class LegalFormsApi {
  constructor(private readonly api: ApiClient) {}

  list(pageIndex = 0, pageSize = 100): Promise<PagedList<LegalForm>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize });
  }

  listAll(): Promise<LegalForm[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<LegalForm> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  /** Deletes by id (reads the lock token with getbyid first). */
  deleteById(id: number): Promise<void> {
    return deleteById(this.api, `${BASE}/getbyid`, `${BASE}/delete`, id);
  }

  /** Sends the create request only and returns the new record's id. */
  async createId(request: CreateLegalFormRequest): Promise<number> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return id;
  }

  async create(request: CreateLegalFormRequest): Promise<LegalForm> {
    return this.getById(await this.createId(request));
  }

  async delete(record: Pick<LegalForm, 'id' | 'lock'>): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only the missing legal forms (see ensureAllByName). */
  async ensureAll(requests: CreateLegalFormRequest[]): Promise<LegalFormEnsureResult[]> {
    return ensureAllByName(await this.listAll(), requests, {
      create: (request) => this.createId(request),
      reload: () => this.listAll(),
    });
  }
}
