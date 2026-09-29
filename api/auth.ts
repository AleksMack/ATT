import { request } from '@playwright/test';
import fs from 'fs';
import { requireEnv } from '../utils/env';

/** Cookies (AccessToken, RefreshToken) saved after API login. Gitignored. */
export const API_STATE_FILE = 'playwright/.auth/api-state.json';

/**
 * API_URL with a trailing slash. Without it, a relative path replaces the last
 * segment: base "https://host/api" + "login/loginotp" gives "https://host/login/loginotp".
 */
export function apiBaseUrl(): string {
  const { API_URL } = requireEnv('API_URL');
  return API_URL.endsWith('/') ? API_URL : `${API_URL}/`;
}

/**
 * Makes sure API_STATE_FILE holds a working session, logging in only when it does not.
 *
 * Login is slow on uat (about 6 s) and repeated failed logins lock the user, so the saved
 * session is reused: one cheap request (user/activeUserData) checks it. An expired AccessToken
 * is refreshed by the server while the RefreshToken (90 days) is valid; the refreshed cookies
 * are saved back. Returns true if it had to log in.
 */
export async function ensureApiSession(): Promise<boolean> {
  if (fs.existsSync(API_STATE_FILE)) {
    const context = await request.newContext({ baseURL: apiBaseUrl(), storageState: API_STATE_FILE });
    try {
      const response = await context.get('user/activeUserData');
      const body = response.ok() ? ((await response.json()) as { error?: { errorCode?: number } }) : undefined;
      if (body && !body.error?.errorCode) {
        await context.storageState({ path: API_STATE_FILE });
        return false;
      }
    } finally {
      await context.dispose();
    }
  }
  await apiLogin();
  return true;
}

/**
 * Logs in through the API, without a browser, and saves the session cookies
 * to API_STATE_FILE.
 *
 * One call: POST login/loginotp with DualShieldLoginRequest { user, password, oneTimePassword }
 * (see docs/openapi.json; the schema allows no other fields). The test stand accepts a fixed OTP.
 * The server answers with httpOnly cookies: AccessToken and RefreshToken.
 */
export async function apiLogin(): Promise<string> {
  const env = requireEnv('USER_LOGIN', 'USER_PASSWORD', 'USER_OTP');
  const context = await request.newContext({ baseURL: apiBaseUrl() });

  try {
    const response = await context.post('login/loginotp', {
      data: { user: env.USER_LOGIN, password: env.USER_PASSWORD, oneTimePassword: env.USER_OTP },
    });
    // Wrong credentials also give HTTP 200, with a non-zero errorCode (100002).
    // Errors contain only the status and code, never the request body.
    if (!response.ok()) {
      throw new Error(`API login failed: HTTP ${response.status()}`);
    }
    const body = (await response.json()) as { error?: { errorCode?: number } };
    if (body.error?.errorCode) {
      throw new Error(`API login failed: errorCode ${body.error.errorCode}`);
    }

    await context.storageState({ path: API_STATE_FILE });
    return API_STATE_FILE;
  } finally {
    await context.dispose();
  }
}
