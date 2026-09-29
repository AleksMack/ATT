import { test, expect } from '@playwright/test';
import { ApiClient, NO_SESSION, type ApiEnvelope, type PagedList } from '../../api/client';

test.describe('API authentication', () => {
  test('should return 200 and a JSON list when the request uses the API login session', async () => {
    // The session is saved by the api-setup project
    const api = await ApiClient.create();

    try {
      // Counterparties list: read-only reference data, safe on a shared stand
      const response = await api.get('clients/list', { pageIndex: 0, pageSize: 1 });

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/json');

      const body: ApiEnvelope<PagedList<unknown>> = await response.json();
      expect(body.error.errorCode).toBe(0);
      expect(body.data).toEqual(
        expect.objectContaining({
          totalRecordsCount: expect.any(Number),
          records: expect.any(Array),
        }),
      );
    } finally {
      await api.dispose();
    }
  });

  test('should return 401 when the request has no session', async () => {
    const api = await ApiClient.create(NO_SESSION);
    try {
      const response = await api.get('clients/list', { pageIndex: 0, pageSize: 1 });
      expect(response.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });
});
