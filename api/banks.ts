import type { ApiClient, PagedList } from './client';
import { ensureAllByKey, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET banks/list. */
export interface Bank {
  id: number;
  nameRus: string;
  nameEng: string;
  abbreviation: string;
  swiftBic: string;
  countryName?: string;
  status: number;
  lock?: { token: string; isLocked: boolean };
}

/** Swagger: CreateBankRequest (the fields used by the seed). */
export interface CreateBankRequest {
  nameRus: string;
  nameEng: string;
  abbreviation: string;
  swiftBic: string;
  inn: string;
  countryId: number;
  cityId: number;
  street: string;
  building: string;
  useForSendingOriginals: boolean;
}

export type BankEnsureResult = EnsureResult<CreateBankRequest, Bank>;

const BASE = 'banks';

/** A bank's natural key is its SWIFT/BIC (docs/test-strategy.md, 5.3). */
const bankKey = (item: { swiftBic: string }) => item.swiftBic;

/** Reference data "Справочники → Финансы → Банки". */
export class BanksApi {
  constructor(private readonly api: ApiClient) {}

  list(pageIndex = 0, pageSize = 100): Promise<PagedList<Bank>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize });
  }

  listAll(): Promise<Bank[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<Bank> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  async create(request: CreateBankRequest): Promise<Bank> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return this.getById(id);
  }

  async delete(record: Pick<Bank, 'id'> & { lock: { token: string } }): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only banks whose SWIFT/BIC is not there yet. */
  async ensureAll(requests: CreateBankRequest[]): Promise<BankEnsureResult[]> {
    return ensureAllByKey(await this.listAll(), requests, bankKey, (request) => this.create(request));
  }
}
