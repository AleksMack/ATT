import type { ApiClient, PagedList } from './client';
import type { PhysicalCharacteristic } from './physicalCharacteristics';
import { deleteById, ensureAllByKey, ensureAllByName, ensureOne, listAllPages, type EnsureResult } from './referenceData';

/** Characteristic link inside a product: the API accepts { id, name } (Swagger: FullCharacteristic). */
export interface ProductCharacteristicRef {
  id: number;
  name: string;
}

/** Record of GET products/list and getbyid (products and subproducts). */
export interface Product {
  id: number;
  /** Set for subproducts. */
  parentId?: number;
  subproductType?: number;
  name: string;
  abbreviation: string;
  comment?: string;
  subProductsCount: number;
  characteristics: Omit<PhysicalCharacteristic, 'lock'>[];
  parentCharacteristics?: Omit<PhysicalCharacteristic, 'lock'>[];
  lock: { token: string; isLocked: boolean };
}

/** Swagger: CreateProductRequest (parentId and subproductType are for subproducts). */
export interface CreateProductRequest {
  name: string;
  abbreviation: string;
  comment?: string;
  parentId?: number;
  /** Integer without a documented meaning in Swagger; existing subproducts use 0 and 2. */
  subproductType?: number;
  characteristics: ProductCharacteristicRef[];
}

export type ProductEnsureResult = EnsureResult<CreateProductRequest, Product>;

/** Subproduct names are unique within a parent, not globally. */
const subproductKey = (item: { parentId?: number; name: string }) => `${item.parentId}/${item.name}`;

const BASE = 'products';

/** Reference data "Справочники → Трейдинг → Продукты" (top-level products, not subproducts). */
export class ProductsApi {
  constructor(private readonly api: ApiClient) {}

  /** One page of top-level products, sorted by name. */
  list(pageIndex = 0, pageSize = 100): Promise<PagedList<Product>> {
    return this.api.getData(`${BASE}/list`, {
      'FilterData.IsProduct': true,
      PageIndex: pageIndex,
      PageSize: pageSize,
      SortColumn: 'name',
    });
  }

  listAll(): Promise<Product[]> {
    return listAllPages((pageIndex) => this.list(pageIndex));
  }

  /** One page of subproducts (all parents), sorted by name. */
  listSubproducts(pageIndex = 0, pageSize = 100): Promise<PagedList<Product>> {
    return this.api.getData(`${BASE}/list`, {
      'FilterData.IsSubProduct': true,
      PageIndex: pageIndex,
      PageSize: pageSize,
      SortColumn: 'name',
    });
  }

  listAllSubproducts(): Promise<Product[]> {
    return listAllPages((pageIndex) => this.listSubproducts(pageIndex));
  }

  /** Subproducts: same rule, keyed by parent id + name. Requests must have parentId. */
  async ensureAllSubproducts(requests: CreateProductRequest[]): Promise<ProductEnsureResult[]> {
    return ensureAllByKey(await this.listAllSubproducts(), requests, subproductKey, {
      create: (request) => this.createId(request),
      reload: () => this.listAllSubproducts(),
    });
  }

  async findByName(name: string): Promise<Product[]> {
    return (await this.listAll()).filter((record) => record.name === name);
  }

  getById(id: number): Promise<Product> {
    return this.api.getData(`${BASE}/getbyid`, { id });
  }

  /** Deletes by id (reads the lock token with getbyid first). */
  deleteById(id: number): Promise<void> {
    return deleteById(this.api, `${BASE}/getbyid`, `${BASE}/delete`, id);
  }

  /** Sends the create request only and returns the new record's id. */
  async createId(request: CreateProductRequest): Promise<number> {
    const { id } = await this.api.postData<{ id: number }>(`${BASE}/create`, request);
    return id;
  }

  async create(request: CreateProductRequest): Promise<Product> {
    return this.getById(await this.createId(request));
  }

  async delete(record: Pick<Product, 'id' | 'lock'>): Promise<void> {
    await this.api.postData(`${BASE}/delete`, { id: record.id, token: record.lock.token });
  }

  /** Loads the full list once and creates only the missing products (see ensureAllByName). */
  async ensureAll(requests: CreateProductRequest[]): Promise<ProductEnsureResult[]> {
    return ensureAllByName(await this.listAll(), requests, {
      create: (request) => this.createId(request),
      reload: () => this.listAll(),
    });
  }

  ensure(request: CreateProductRequest): Promise<{ record: Product; created: boolean }> {
    return ensureOne((requests) => this.ensureAll(requests), request);
  }
}
