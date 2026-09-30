import type { ApiClient, PagedList } from './client';
import { deleteById, ensureAllByKey, ensureAllByName, listAllPages, type EnsureResult } from './referenceData';

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

  /** Deletes by id (reads the lock token with getbyid first). */
  deleteById(id: number): Promise<void> {
    return deleteById(this.api, `${BASE}/getbyid`, `${BASE}/delete`, id);
  }

  /** Sends the create request only and returns the new record's id. */
  async createId(request: CreateProjectRequest): Promise<number> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return id;
  }

  async create(request: CreateProjectRequest): Promise<Project> {
    return this.getById(await this.createId(request));
  }

  async delete(record: Pick<Project, 'id'> & { lock: { token: string } }): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only the missing projects (see ensureAllByName). */
  async ensureAll(requests: CreateProjectRequest[]): Promise<ProjectEnsureResult[]> {
    return ensureAllByName(await this.listAll(), requests, {
      create: (request) => this.createId(request),
      reload: () => this.listAll(),
    });
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
   * in `requests` once (requests must have parentId), and once more after the creates:
   * created ones are returned as stored in the parent's subproject list.
   */
  async ensureAllSubprojects(requests: CreateProjectRequest[]): Promise<ProjectEnsureResult[]> {
    const parentIds = [...new Set(requests.map((request) => request.parentId!))];
    const listParents = async () => (await Promise.all(parentIds.map((id) => this.listSubprojects(id)))).flat();
    return ensureAllByKey(await listParents(), requests, subprojectKey, {
      create: async (request) => (await this.api.postData<{ id: number }>(`${BASE}/create`, request)).id,
      reload: listParents,
    });
  }
}
