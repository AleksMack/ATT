import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { apiBaseUrl } from '../../api/auth';
import type { ApiEnvelope } from '../../api/client';
import { requireEnv } from '../../utils/env';

/** Wrong login or password (response message: "Неправильный логин или пароль"). */
const WRONG_CREDENTIALS = 100002;

test.describe('API login: POST login/loginotp', () => {
  let api: APIRequestContext;

  test.beforeEach(async () => {
    api = await request.newContext({ baseURL: apiBaseUrl() });
  });

  test.afterEach(async () => {
    await api.dispose();
  });

  test('should return userId and set session cookies when credentials are valid', async () => {
    const env = requireEnv('USER_LOGIN', 'USER_PASSWORD', 'USER_OTP');

    const response = await api.post('login/loginotp', {
      data: { user: env.USER_LOGIN, password: env.USER_PASSWORD, oneTimePassword: env.USER_OTP },
    });

    expect(response.status()).toBe(200);
    const body: ApiEnvelope<{ userId: number }> = await response.json();
    expect(body.error.errorCode).toBe(0);
    expect(body.data.userId).toEqual(expect.any(Number));

    // Compare only names and flags: a failed assertion prints the compared value,
    // so the cookie objects (with token values) must never reach expect()
    const cookies = await api.storageState().then((state) => state.cookies);
    const sessionCookies = cookies
      .filter((cookie) => ['AccessToken', 'RefreshToken'].includes(cookie.name))
      .map((cookie) => ({ name: cookie.name, httpOnly: cookie.httpOnly }));
    expect(sessionCookies).toEqual(
      expect.arrayContaining([
        { name: 'AccessToken', httpOnly: true },
        { name: 'RefreshToken', httpOnly: true },
      ]),
    );
  });

  test('should return error 100002 and no session when the user does not exist', async () => {
    // A user that does not exist, so failed attempts cannot lock a real account
    const response = await api.post('login/loginotp', {
      data: { user: 'AUTO_no_such_user', password: 'AUTO_wrong', oneTimePassword: 'AUTO_wrong' },
    });

    // The API reports business errors with HTTP 200 and a non-zero errorCode
    expect(response.status()).toBe(200);
    const body: ApiEnvelope<unknown> = await response.json();
    expect(body.error.errorCode).toBe(WRONG_CREDENTIALS);
    expect(body.data).toBeUndefined();

    const cookies = await api.storageState().then((state) => state.cookies);
    expect(cookies.map((cookie) => cookie.name)).not.toContain('AccessToken');
  });
});
