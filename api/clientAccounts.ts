import type { ApiClient, PagedList } from './client';
import { deleteById, ensureAllByKey, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET clients/accountslist. */
export interface ClientAccount {
  id: number;
  clientId: number;
  bankId: number;
  accountNumber: string;
  iban?: string;
  currency: number;
  status: number;
  lock?: { token: string; isLocked: boolean };
}

/** Swagger: CreateCounterpartyAccountRequest. */
export interface CreateClientAccountRequest {
  clientId: number;
  /** Workbook Counterparty ID, e.g. "CP-001". */
  clientIdentity: string;
  bankId: number;
  accountNumber: string;
  iban: string | null;
  /** ISO 4217 numeric code from user/dictionary currencies, e.g. 978 = EUR. */
  currency: number;
  /** user/dictionary bankAccountTypes: 0 = settlement ("Расчетный"). */
  accountType: number;
  /** user/dictionary bankAccountStatuses: 0 = open, 1 = frozen, 2 = closed. */
  status: number;
  /** "YYYY-MM-DD" */
  statusDate: string;
}

export type ClientAccountEnsureResult = EnsureResult<CreateClientAccountRequest, ClientAccount>;

const BASE = 'clients';

/** Bank accounts of counterparties (sub-resource of "clients"). */
export class ClientAccountsApi {
  constructor(private readonly api: ApiClient) {}

  list(pageIndex = 0, pageSize = 200): Promise<PagedList<ClientAccount>> {
    return this.api.getData(`${BASE}/accountslist`, { PageIndex: pageIndex, PageSize: pageSize });
  }

  listAll(): Promise<ClientAccount[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<ClientAccount> {
    return this.api.getData(`${BASE}/getaccountbyid`, { id });
  }

  /** Deletes by id (reads the lock token with getbyid first). */
  deleteById(id: number): Promise<void> {
    return deleteById(this.api, `${BASE}/getaccountbyid`, `${BASE}/deleteaccount`, id);
  }

  /** Sends the create request only and returns the new record's id. */
  async createId(request: CreateClientAccountRequest): Promise<number> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/createaccount`, request);
    return id;
  }

  async create(request: CreateClientAccountRequest): Promise<ClientAccount> {
    return this.getById(await this.createId(request));
  }

  async delete(record: Pick<ClientAccount, 'id'> & { lock: { token: string } }): Promise<void> {
    await this.api.postData(`${BASE}/deleteaccount`, { id: record.id, token: record.lock.token });
  }

  /**
   * Loads all accounts once and creates only the missing ones. The natural key is the account
   * number: IBAN is missing ("N/A") for many accounts.
   */
  async ensureAll(requests: CreateClientAccountRequest[]): Promise<ClientAccountEnsureResult[]> {
    return ensureAllByKey(await this.listAll(), requests, (item) => item.accountNumber, {
      create: (request) => this.createId(request),
      reload: () => this.listAll(),
    });
  }
}
