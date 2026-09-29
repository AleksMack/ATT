import type { ApiClient, PagedList } from './client';
import { ensureAllByKey, ensureAllByName, listAllPages, type EnsureResult } from './referenceData';

/** Record of GET projects/list. */
export interface Project {
  id: number;
  name: string;
  code?: string;
  startDate: string;
  comment?: string;
  status: number;
  parentId?: number;
  lock?: { token: string; isLocked: boolean };
}

/** Swagger: CreateProjectRequest (parentId is for subprojects). */
export interface CreateProjectRequest {
  name: string;
  code: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  comment?: string;
  parentId?: number;
}

export type ProjectEnsureResult = EnsureResult<CreateProjectRequest, Project>;

const BASE = 'projects';

/** Subproject names are unique within a parent, not globally. */
const subprojectKey = (item: { parentId?: number; name: string }) => `${item.parentId}/${item.name}`;

/** Reference data "Справочники → Трейдинг → Проекты". */
export class ProjectsApi {
  constructor(private readonly api: ApiClient) {}

  list(pageIndex = 0, pageSize = 100): Promise<PagedList<Project>> {
    return this.api.getData(`${BASE}/list`, { PageIndex: pageIndex, PageSize: pageSize });
  }

  listAll(): Promise<Project[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  getById(id: number): Promise<Project> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  async create(request: CreateProjectRequest): Promise<Project> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return this.getById(id);
  }

  async delete(record: Pick<Project, 'id'> & { lock: { token: string } }): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only the missing projects (see ensureAllByName). */
  async ensureAll(requests: CreateProjectRequest[]): Promise<ProjectEnsureResult[]> {
    return ensureAllByName(await this.listAll(), requests, (request) => this.create(request));
  }

  /** Subprojects of one project (they are not in projects/list). FilterData.Id is the parent id. */
  listSubprojects(parentId: number): Promise<Project[]> {
    return listAllPages((pageIndex) =>
      this.api.getData<PagedList<Project>>(`${BASE}/subprojects`, {
        'FilterData.Id': parentId,
        PageIndex: pageIndex,
        PageSize: 1000,
        SortColumn: 'name',
      }),
    );
  }

  async deleteSubproject(record: Pick<Project, 'id'> & { parentId: number; lock: { token: string } }): Promise<void> {
    await this.api.postData(`${BASE}/deletesubproject`, { id: record.id, token: record.lock.token, parentId: record.parentId });
  }

  /**
   * Subprojects: same rule, keyed by parent id + name. Loads the subprojects of every parent
   * in `requests` once (requests must have parentId). Created ones are returned as stored
   * in the parent's subproject list.
   */
  async ensureAllSubprojects(requests: CreateProjectRequest[]): Promise<ProjectEnsureResult[]> {
    const parentIds = [...new Set(requests.map((request) => request.parentId!))];
    const existing = (await Promise.all(parentIds.map((id) => this.listSubprojects(id)))).flat();
    return ensureAllByKey(existing, requests, subprojectKey, async (request) => {
      const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
      const created = (await this.listSubprojects(request.parentId!)).find((s) => s.id === id);
      if (!created) throw new Error(`subproject ${id} not found under parent ${request.parentId} after create`);
      return created;
    });
  }
}
