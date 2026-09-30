import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { API_STATE_FILE, apiBaseUrl } from './auth';

type Params = Record<string, string | number | boolean>;
type StorageState = NonNullable<NonNullable<Parameters<typeof request.newContext>[0]>['storageState']>;

/** Every API response is wrapped: { data, error }. errorCode 0 means success. */
export interface ApiEnvelope<T> {
  data: T;
  error: { errorCode: number; message?: string };
}

/** Response data of GET <resource>/list. */
export interface PagedList<T> {
  totalRecordsCount: number;
  filteredRecordsCount: number;
  pageIndex: number;
  records: T[];
}

/** Session with no cookies, for checking that the API rejects anonymous requests. */
export const NO_SESSION: StorageState = { cookies: [], origins: [] };

/**
 * API client that sends every request with the session saved by apiLogin().
 * Resource clients in api/ (one file per resource) are built on top of it.
 */
export class ApiClient {
  private constructor(private readonly context: APIRequestContext) {}

  static async create(storageState: StorageState = API_STATE_FILE): Promise<ApiClient> {
    const context = await request.newContext({
      baseURL: apiBaseUrl(),
      storageState,
      extraHTTPHeaders: { Accept: 'application/json' },
    });
    return new ApiClient(context);
  }

  /** Raw GET, for tests that assert on status or headers. */
  get(path: string, params?: Params): Promise<APIResponse> {
    return this.context.get(path, { params });
  }

  /** Raw POST, for tests that assert on status or headers. */
  post(path: string, data?: unknown): Promise<APIResponse> {
    return this.context.post(path, { data });
  }

  /** GET that expects success and returns the unwrapped `data`. */
  async getData<T>(path: string, params?: Params): Promise<T> {
    return this.unwrap<T>(await this.get(path, params), 'GET', path);
  }

  /** POST that expects success and returns the unwrapped `data`. */
  async postData<T>(path: string, data?: unknown): Promise<T> {
    return this.unwrap<T>(await this.post(path, data), 'POST', path);
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  private async unwrap<T>(response: APIResponse, method: string, path: string): Promise<T> {
    if (!response.ok()) {
      // Only the server's error code and message, never the request (it may hold secrets)
      const body = (await response.json().catch(() => undefined)) as Partial<ApiEnvelope<unknown>> & { title?: string } | undefined;
      const reason = body?.error ? `errorCode ${body.error.errorCode} ${body.error.message ?? ''}` : (body?.title ?? '');
      throw new Error(`${method} ${path} failed: HTTP ${response.status()} ${reason}`.trim());
    }
    const body = (await response.json()) as ApiEnvelope<T>;
    if (body.error?.errorCode) {
      throw new Error(`${method} ${path} failed: errorCode ${body.error.errorCode} ${body.error.message ?? ''}`.trim());
    }
    return body.data;
  }
}
