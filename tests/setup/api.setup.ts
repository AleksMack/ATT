import { test as setup } from '@playwright/test';
import { ensureApiSession } from '../../api/auth';

// Runs once before the API tests: reuses the saved API session, logs in only if it is not valid
setup('API session', async () => {
  const loggedIn = await ensureApiSession();
  setup.info().annotations.push({ type: 'session', description: loggedIn ? 'logged in' : 'reused saved session' });
});
