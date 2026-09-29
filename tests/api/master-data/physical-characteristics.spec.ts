import { test, expect } from '@playwright/test';
import { apiLogin } from '../../../api/auth';
import { ApiClient, type ApiEnvelope } from '../../../api/client';
import {
  CHARACTERISTIC_NAME_MAX_LENGTH,
  PhysicalCharacteristicsApi,
  VALIDATION_ERROR,
} from '../../../api/physicalCharacteristics';
import characteristics from '../../../data/master/characteristics.json';

const CH_001 = characteristics.find((item) => item.key === 'CH-001')!;

test.describe('Master data: physical characteristics', () => {
  let api: ApiClient;
  let physicalCharacteristics: PhysicalCharacteristicsApi;

  test.beforeAll(async () => {
    await apiLogin();
    api = await ApiClient.create();
    physicalCharacteristics = new PhysicalCharacteristicsApi(api);
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('should reuse the existing characteristic and not create a duplicate when it already exists', async () => {
    // First call creates CH-001 only if the stand does not have it yet (tier 1: permanent data)
    const first = await physicalCharacteristics.ensure({ name: CH_001.name, comment: CH_001.comment });
    const countAfterFirst = (await physicalCharacteristics.findByName(CH_001.name)).length;

    const second = await physicalCharacteristics.ensure({ name: CH_001.name, comment: CH_001.comment });

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect((await physicalCharacteristics.findByName(CH_001.name)).length).toBe(countAfterFirst);
  });

  test('should create, read and delete a characteristic when it does not exist', async () => {
    // Base-36 timestamp keeps the name within CHARACTERISTIC_NAME_MAX_LENGTH (16 chars)
    const request = { name: `AUTO_CH_${Date.now().toString(36)}`, comment: 'AUTO_ created by API test' };
    let createdId: number | undefined;

    try {
      const { record, created } = await physicalCharacteristics.ensure(request);
      createdId = record.id;

      expect(created).toBe(true);
      expect(record).toEqual(expect.objectContaining({ name: request.name, comment: request.comment }));
      expect(await physicalCharacteristics.findByName(request.name)).toHaveLength(1);

      await physicalCharacteristics.delete(record);
      createdId = undefined;

      expect(await physicalCharacteristics.findByName(request.name)).toHaveLength(0);
    } finally {
      // Clean up if the test failed between create and delete
      if (createdId !== undefined) {
        await physicalCharacteristics.delete(await physicalCharacteristics.getById(createdId));
      }
    }
  });

  test('should reject the characteristic when the name is longer than 20 characters', async () => {
    const name = `AUTO_LEN_${'X'.repeat(CHARACTERISTIC_NAME_MAX_LENGTH)}`.slice(0, CHARACTERISTIC_NAME_MAX_LENGTH + 1);

    const response = await api.post('physicalcharacteristics/create', { name });

    expect(response.status()).toBe(200);
    const body: ApiEnvelope<{ id: number } | undefined> = await response.json();
    try {
      expect(body.error).toEqual(expect.objectContaining({ errorCode: VALIDATION_ERROR, message: 'Name' }));
    } finally {
      // If the server ever accepts it, do not leave the record behind
      if (body.data?.id) {
        await physicalCharacteristics.delete(await physicalCharacteristics.getById(body.data.id));
      }
    }
  });
});
