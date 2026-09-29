import type { ApiClient, PagedList } from './client';
import { ensureAllByKey, listAllPages, type EnsureResult } from './referenceData';

/** A port as the seed sees it: id = the port id (entityId in the logistic objects list). */
export interface Port {
  id: number;
  name: string;
  unlocode: string;
  /** Set by getById (not in the logistic objects list). */
  countryId?: number;
  cityId?: number;
}

/** Record of GET logisticobjects/list: ports, resources and terminals in one list. */
interface LogisticObject {
  id: number;
  entityId: number;
  name: string;
  /** 1 = port */
  type: number;
  /** e.g. "AEFJR (UN/LOCODE)" */
  code?: string;
  systemStatus: number;
}

export interface SanctionStatus {
  id: number;
  name: string;
}

/** The sanction status sent for ports with Status "Restricted" in the workbook. */
export const SANCTIONED: SanctionStatus = { id: 1, name: 'Санкционный объект' };

/** Swagger: CreateUpdatePortRequest (the fields used by the seed). */
export interface CreatePortRequest {
  name: string;
  unlocode: string;
  countryId: number;
  cityId: number;
  addressLine: string;
  /** Only for sanctioned ports; left out otherwise. */
  sanctionStatuses?: SanctionStatus[];
}

export type PortEnsureResult = EnsureResult<CreatePortRequest, Port>;

const PORT_TYPE = 1;
/** logisticobjects/list systemStatus of objects in use (as in the UI list). */
const ACTIVE = 0;

/** Reference data "Справочники → Логистика → Логистические объекты", ports. */
export class PortsApi {
  constructor(private readonly api: ApiClient) {}

  /** All ports in use, from the shared logistic objects list. */
  async listAll(): Promise<Port[]> {
    const objects = await listAllPages((pageIndex) =>
      this.api.getData<PagedList<LogisticObject>>('logisticobjects/list', {
        'FilterData.Type': PORT_TYPE,
        'FilterData.SystemStatus': ACTIVE,
        PageIndex: pageIndex,
        PageSize: 100,
      }),
    );
    return objects
      .filter((o) => o.type === PORT_TYPE)
      .map((o) => ({ id: o.entityId, name: o.name, unlocode: (o.code ?? '').replace(/\s*\(UN\/LOCODE\)\s*$/, '') }));
  }

  getById(id: number): Promise<Port> {
    return this.api.getData('ports/getbyid', { id });
  }

  async create(request: CreatePortRequest): Promise<Port> {
    const { id } = await this.api.postData<{ id: number }>('ports/create', request);
    return this.getById(id);
  }

  /** The natural key is the UN/LOCODE: creates only ports whose code is not in the list yet. */
  async ensureAll(requests: CreatePortRequest[]): Promise<PortEnsureResult[]> {
    return ensureAllByKey(await this.listAll(), requests, (item) => item.unlocode, (request) => this.create(request));
  }
}
