import type { ApiClient, PagedList } from './client';
import { ensureAllByName, listAllPages, type EnsureResult } from './referenceData';

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

  async create(request: CreateLegalFormRequest): Promise<LegalForm> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return this.getById(id);
  }

  async delete(record: Pick<LegalForm, 'id' | 'lock'>): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only the missing legal forms (see ensureAllByName). */
  async ensureAll(requests: CreateLegalFormRequest[]): Promise<LegalFormEnsureResult[]> {
    return ensureAllByName(await this.listAll(), requests, (request) => this.create(request));
  }
}
