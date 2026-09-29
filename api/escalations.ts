import type { ApiClient, PagedList } from './client';
import { ensureAllByKey, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET escalation/list and getbyid. */
export interface Escalation {
  id: number;
  name: string;
  comment?: string;
  escalationType: number;
  productCharacteristicId: number;
  priceIncrease?: boolean;
  lock?: { token: string; isLocked: boolean };
}

/** Swagger: CreateUpdateEscalationRequest (the fields used by the seed). */
export interface CreateEscalationRequest {
  name: string;
  /** 3 for "Above", 2 for "Below" (values given by the team). */
  escalationType: number;
  /** Id of the physical characteristic in the system. */
  productCharacteristicId: number;
  defaultTop: boolean;
  defaultStep: number | null;
  /** true for a penalty (the price goes up), false for a premium or a rejection. */
  priceIncrease: boolean;
  comment: string;
}

export type EscalationEnsureResult = EnsureResult<CreateEscalationRequest, Escalation>;

const BASE = 'escalation';

/**
 * An escalation is bound to a characteristic, not to a subproduct, and the workbook reuses names
 * for different subproducts with different specs. So one workbook row is one escalation:
 * the key is name + characteristic + comment.
 */
const escalationKey = (item: { name: string; productCharacteristicId: number; comment?: string }) =>
  `${item.productCharacteristicId}/${item.name}/${item.comment ?? ''}`;

/** Reference data "Справочники → Трейдинг → Эскалации". */
export class EscalationsApi {
  constructor(private readonly api: ApiClient) {}

  list(pageIndex = 0, pageSize = 100): Promise<PagedList<Escalation>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize });
  }

  listAll(): Promise<Escalation[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<Escalation> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  async create(request: CreateEscalationRequest): Promise<Escalation> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return this.getById(id);
  }

  async delete(record: Pick<Escalation, 'id'> & { lock: { token: string } }): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only the missing escalations (see escalationKey). */
  async ensureAll(requests: CreateEscalationRequest[]): Promise<EscalationEnsureResult[]> {
    return ensureAllByKey(await this.listAll(), requests, escalationKey, (request) => this.create(request));
  }
}
