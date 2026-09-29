# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Playwright + TypeScript test suite (UI e2e + API) for a CRM web app in the oil trading domain. The app is tested as a black box: there is no access to its source code, only the UI and its Swagger-documented API. There is no build step and no `npm` scripts; everything runs through `npx playwright`. Chromium only.

## Commands

```bash
npm ci && npx playwright install --with-deps   # setup
npx playwright test                            # run everything
npx playwright test --project=ui               # UI tests only (runs `setup` first)
npx playwright test --project=api              # API tests only
npx playwright test tests/ui/foo.spec.ts       # single file
npx playwright test -g "test name"             # single test by title
npx playwright test --headed / --debug / --ui  # local debugging
npx playwright show-report                     # open HTML report
npx playwright show-trace test-results/<...>/trace.zip
```

## Configuration and environment

- `.env` (loaded via `dotenv/config` in `playwright.config.ts`) supplies `BASE_URL` (UI), `API_URL` (API project baseURL), `USER_LOGIN`, `USER_PASSWORD`. Keys are listed in `.env.example`. Do not read or modify `.env`.

## Architecture (playwright.config.ts)

Three projects with distinct directories:

1. **`setup`** — `tests/setup/*.setup.ts`. Logs in once and saves session state to `playwright/.auth/user.json` (exported as `AUTH_FILE` from the config; gitignored).
2. **`ui`** — `tests/ui/`, depends on `setup`, Desktop Chrome at 1600x900. It uses the saved `storageState` **only if the file already exists when the config is loaded**, so on a fresh checkout the first run's UI tests start unauthenticated. Run `--project=setup` first, or restructure if that becomes a problem.
3. **`api`** — `tests/api/`, uses the `request` fixture with a JSON `Accept` header. It does not depend on `setup`.

Execution is intentionally serial (`workers: 1`, `fullyParallel: false`) because tests share data on one test environment. Keep tests independent of order anyway, but don't assume isolation between them. Timeouts are generous (60s test, 15s action, 30s navigation) because the CRM is slow. Trace, screenshot and video are kept only for failed tests.

## Layout

- `tests/setup`, `tests/ui`, `tests/api` — the three projects above
- `pages/` — page objects for the UI tests
- `data/` — test data

- `specs/` — Markdown test plans written by the planner agent

There is no `auth.setup.ts` yet.

## AI tooling (Playwright MCP + Test Agents)

`.mcp.json` defines two MCP servers. Both start via `cmd /c npx`, because on Windows a bare `npx` fails to launch (ENOENT):
- `playwright` — `@playwright/mcp`, pinned to 0.0.83, for driving a browser interactively
- `playwright-test` — `npx playwright run-test-mcp-server`, used by the Test Agents in `.claude/agents/`

The agents are `playwright-test-planner` (explores the app and writes a plan to `specs/`), `playwright-test-generator` (turns plan items into spec files) and `playwright-test-healer` (runs and fixes failing tests). `tests/ui/seed.spec.ts` is the seed test the agents start from; put shared setup there (login, navigation), not assertions.

Re-running `npx playwright init-agents` rewrites `.mcp.json` and drops the `playwright` server, so restore it afterwards.
