import { request } from '@playwright/test';
import { requireEnv } from '../utils/env';

/** Cookies (AccessToken, RefreshToken) saved after API login. Gitignored. */
export const API_STATE_FILE = 'playwright/.auth/api-state.json';

/**
 * Logs in through the API, without a browser, and saves the session cookies
 * to API_STATE_FILE.
 *
 * Login is two calls, the same as the UI does:
 *   1. POST login/checkloginpassword { user, password }
 *   2. POST login/loginotp { user, password, oneTimePassword, otpPasswordType: false }
 *      (otpPasswordType: false = "Use OTP from the app"; the test stand accepts a fixed OTP)
 * The server answers with httpOnly cookies: AccessToken (10 min) and RefreshToken (90 days).
 * An expired AccessToken is refreshed by the server itself while RefreshToken is valid.
 */
export async function apiLogin(): Promise<string> {
  const env = requireEnv('API_URL', 'USER_LOGIN', 'USER_PASSWORD', 'USER_OTP');
  const context = await request.newContext({ baseURL: env.API_URL });

  try {
    const credentials = { user: env.USER_LOGIN, password: env.USER_PASSWORD };

    // Error messages contain only the step and status, never the request body
    const check = await context.post('login/checkloginpassword', { data: credentials });
    if (!check.ok()) {
      throw new Error(`API login failed at checkloginpassword: HTTP ${check.status()}`);
    }

    const otp = await context.post('login/loginotp', {
      data: { ...credentials, oneTimePassword: env.USER_OTP, otpPasswordType: false },
    });
    if (!otp.ok()) {
      throw new Error(`API login failed at loginotp: HTTP ${otp.status()}`);
    }

    await context.storageState({ path: API_STATE_FILE });
    return API_STATE_FILE;
  } finally {
    await context.dispose();
  }
}
