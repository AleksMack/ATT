import type { ApiClient, PagedList } from './client';
import { deleteById, ensureAllByKey, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET clients/list (counterparties). */
export interface Client {
  id: number;
  legalName: string;
  abbreviation?: string;
  counterpartyKind: number;
  counterpartyTypes: number[];
  kycStatus: number;
  lock: { token: string; isLocked: boolean };
}

/**
 * Swagger: CreateUpdateCounterpartyRequest, plus legalFormAbbreviationRUS and role, which the UI
 * sends although Swagger does not list them.
 */
export interface CreateClientRequest {
  /** 0 = not a group company, 1 = group company */
  counterpartyKind: 0 | 1;
  counterpartyTypes: number[];
  legalName: string;
  legalFormId: number;
  abbreviation: string;
  legalNameRu: string;
  legalFormAbbreviationRUS: string;
  tin: string;
  vatCode: string;
  certificateNumber: string;
  kycStatus: number;
  creditLimit: number;
  countryId: number;
  cityId: number;
  useForSendingOriginals: boolean;
  role: number;
}

export type ClientEnsureResult = EnsureResult<CreateClientRequest, Client>;

const BASE = 'clients';

/** Reference data "Справочники → Общие → Контрагенты" (API resource "clients"). */
export class ClientsApi {
  constructor(private readonly api: ApiClient) {}

  list(pageIndex = 0, pageSize = 100): Promise<PagedList<Client>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize });
  }

  listAll(): Promise<Client[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<Client> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  /** Deletes by id (reads the lock token with getbyid first). */
  deleteById(id: number): Promise<void> {
    return deleteById(this.api, `${BASE}/getbyid`, `${BASE}/delete`, id);
  }

  /** Sends the create request only and returns the new record's id. */
  async createId(request: CreateClientRequest): Promise<number> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return id;
  }

  async create(request: CreateClientRequest): Promise<Client> {
    return this.getById(await this.createId(request));
  }

  async delete(record: Pick<Client, 'id' | 'lock'>): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /**
   * Loads the full list once and creates only counterparties whose legal name is not there yet.
   * Abbreviations must be unique too (errorCode 16), so rows sharing one are sent in order.
   */
  async ensureAll(requests: CreateClientRequest[]): Promise<ClientEnsureResult[]> {
    return ensureAllByKey(await this.listAll(), requests, (item) => item.legalName, {
      create: (request) => this.createId(request),
      reload: () => this.listAll(),
      conflictKeys: (request) => [`abbreviation:${request.abbreviation}`],
    });
  }
}
