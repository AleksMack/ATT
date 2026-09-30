import type { ApiClient, PagedList } from './client';
import type { SanctionStatus } from './ports';
import { deleteById, ensureAllByKey, listAllPages, type EnsureResult } from './referenceData';

/** A resource as the seed sees it: id = the resource id (entityId in the logistic objects list). */
export interface Resource {
  id: number;
  name: string;
}

/** Record of GET logisticobjects/list: ports, resources and railway stations in one list. */
interface LogisticObject {
  entityId: number;
  name: string;
  /** user/dictionary logisticObjectTypes: 1 = port, 2 = resource, 3 = railway station */
  type: number;
}

/** Swagger: CreateUpdateResourceRequest (the fields used by the seed). */
export interface CreateResourceRequest {
  name: string;
  unlocode: string;
  countryId: number;
  cityId: number;
  /** Only for sanctioned resources; left out otherwise. */
  sanctionStatuses?: SanctionStatus[];
}

export type ResourceEnsureResult = EnsureResult<CreateResourceRequest, Resource>;

const RESOURCE_TYPE = 2;
/** user/dictionary logisticObjectSystemStatuses: 0 = active */
const ACTIVE = 0;

/** Reference data "Справочники → Логистика → Логистические объекты", resources. */
export class ResourcesApi {
  constructor(private readonly api: ApiClient) {}

  /** All active resources, from the shared logistic objects list. */
  async listAll(): Promise<Resource[]> {
    const objects = await listAllPages((pageIndex) =>
      this.api.getData<PagedList<LogisticObject>>('logisticobjects/list', {
        'FilterData.Type': RESOURCE_TYPE,
        'FilterData.SystemStatus': ACTIVE,
        PageIndex: pageIndex,
        PageSize: 100,
      }),
    );
    return objects.filter((o) => o.type === RESOURCE_TYPE).map((o) => ({ id: o.entityId, name: o.name }));
  }

  getById(id: number): Promise<Resource> {
    return this.api.getData('resources/getbyid', { id });
  }

  /** Deletes by id (reads the lock token with getbyid first). */
  deleteById(id: number): Promise<void> {
    return deleteById(this.api, 'resources/getbyid', 'resources/delete', id);
  }

  /** Sends the create request only and returns the new record's id. */
  async createId(request: CreateResourceRequest): Promise<number> {
    const { id } = await this.api.postData<{ id: number }>('resources/create', request);
    return id;
  }

  async create(request: CreateResourceRequest): Promise<Resource> {
    return this.getById(await this.createId(request));
  }

  /** Resources are matched by name: several resources share a port and its UN/LOCODE. */
  async ensureAll(requests: CreateResourceRequest[]): Promise<ResourceEnsureResult[]> {
    return ensureAllByKey(await this.listAll(), requests, (item) => item.name, {
      create: (request) => this.createId(request),
      reload: () => this.listAll(),
    });
  }
}
