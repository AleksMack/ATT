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
npm run seed:characteristics                   # seed tab 7 of the master data workbook via API
npm run seed:products [-- --limit N]           # seed products from tab 8 (default: all)
npm run seed:subproducts [-- --limit N]        # seed subproducts from tab 9 (default: first only)
npm run seed:shippers [-- --limit N]           # seed shippers from tab 5 (name only; default: all)
npm run seed:banks [-- --limit N]              # seed banks from tab 2 (key: SWIFT/BIC; default: first only)
npm run seed:projects [-- --limit N]           # seed projects from tab 6 (default: first only)
npm run seed:subprojects [-- --limit N]        # seed subprojects from tab 6 (default: first only)
npm run seed:legal-forms [-- --limit N]        # seed legal forms from tab 1 (default: first only)
```

Seed scripts (`scripts/seed-*.ts`, run with `tsx`) read a tab of `docs/CRM_Master_Data_Request_TESTDATA_v3.xlsx`, rewrite `data/master/<tab>.json`, create only missing records via the resource client's `ensureAll()`, and write the result back to the workbook: green row = in the system, red row = not created or error, with the reason in the "Seed status" column. Each run first clears the marks of its tab, so the colors show only that run. Characteristic links go by Characteristic ID through tab 7 (`scripts/master-data/characteristicLinks.ts`). Order: characteristics, then products, then subproducts. Close the workbook in Excel before running a seed, or the write fails.

## Configuration and environment

- `.env` (loaded via `dotenv/config` in `playwright.config.ts`) supplies `BASE_URL` (UI), `API_URL` (API project baseURL), `USER_LOGIN`, `USER_PASSWORD`, `USER_OTP`. Keys are listed in `.env.example`. Do not read or modify `.env`.

## Architecture (playwright.config.ts)

Three projects with distinct directories:

1. **`setup`** — `tests/setup/*.setup.ts`. `auth.setup.ts` logs in once and saves session state to `playwright/.auth/user.json` (exported as `AUTH_FILE` from the config; gitignored). Trace and video are off for this project because they would record the password and OTP.

   Login is three screens: Login + Password → "Next"; "Select verification method" → "Use OTP from the app"; "OTP password" → "Login"; then the app lands on `/dashboard`. The test stand accepts a fixed OTP (`USER_OTP`). The first click on the verification method is sometimes ignored while the screen is still switching, so it is retried with `toPass()`.
2. **`ui`** — `tests/ui/`, depends on `setup`, Desktop Chrome at 1600x900. It uses the saved `storageState` **only if the file already exists when the config is loaded**, so on a fresh checkout the first run's UI tests start unauthenticated. Run `--project=setup` first, or restructure if that becomes a problem.
3. **`api`** — `tests/api/`, uses the `request` fixture with a JSON `Accept` header. It does not depend on `setup`: API tests log in with `apiLogin()` (`POST login/checkloginpassword`, then `POST login/loginotp` with `otpPasswordType: false`) and use `ApiClient`. Trace is off for this project because it would record the login request body.

   API facts: the test environment is **uat** (`BASE_URL=https://uat.ctrm.biz`, `API_URL=https://uat-api.ctrm.biz/api/`); Swagger is at `https://uat-api.ctrm.biz/swagger/v1/swagger.json` and saved as `docs/openapi.json` (`docs/discovery.md` describes the older ba01 stand). Several failed logins lock the user name (`errorCode` 100009), so never retry a failed login in a loop. Every response is wrapped as `{ data, error: { errorCode } }` (0 = success; `ApiClient.getData()`/`postData()` unwrap it). Resources follow `GET <resource>/list?pageIndex=&pageSize=` (`data` is `{ totalRecordsCount, filteredRecordsCount, pageIndex, records }`), `GET <resource>/getbyid`, and `POST <resource>/create|update|delete`. Auth is httpOnly cookies (`AccessToken` 10 min, `RefreshToken` 90 days) that the server refreshes itself, so the saved `AUTH_FILE` works as `storageState` for API calls.

Execution is intentionally serial (`workers: 1`, `fullyParallel: false`) because tests share data on one test environment. Keep tests independent of order anyway, but don't assume isolation between them. Timeouts are generous (60s test, 15s action, 30s navigation) because the CRM is slow. Trace, screenshot and video are kept only for failed tests.

## Layout

- `tests/setup`, `tests/ui`, `tests/api` — the three projects above
- `pages/` — page objects for the UI tests
- `data/` — test data
- `api/` — API layer: `auth.ts` (API login, saves cookies to `playwright/.auth/api-state.json`), `client.ts` (`ApiClient` that reuses that state; typed resource clients go next to it, one file per resource)
- `utils/` — shared helpers (`env.ts`: `requireEnv()` reads `.env` keys and fails with key names only)

- `specs/` — Markdown test plans written by the planner agent
- `docs/` — project notes; `docs/discovery.md` has the API resource map, auth details, menu structure and PoC candidates

The app (OptiFlow, Angular) has no `data-testid` attributes, so locators rely on roles and accessible names. The UI is in Russian (e.g. main menu buttons "Трейдинг", "Финансы", "Логистика"), and menu button names include counters ("Трейдинг 3"), so match them with a regex.

## Conventions

- **Page Objects:** one class per page in `pages/`. Tests call page methods only; locators and raw `page` calls live inside the page classes.
- **Locators:** use `getByRole`, `getByLabel` and `getByTestId` first. CSS or XPath only as a last resort, with a comment explaining why.
- **Waiting:** no hard waits (`waitForTimeout`). Rely on Playwright's auto-waiting and web-first `expect` assertions (`toBeVisible`, `toHaveURL`, `toPass` for retries).
- **Test data:** every test creates its own data and deletes it at the end, so tests never depend on each other or on leftovers.
- **Naming test records:** every record a test creates has a name starting with `AUTO_`, so leftovers are easy to find and clean up.
- **API helpers:** in `api/`, one file per resource, typed with interfaces taken from the Swagger schema.
- **Reference data** (dictionaries) is created via the API, not the UI.
- **Secrets** come only from `.env` and are never printed (not in the console, logs, traces or chat). Never pass an object that holds a secret (cookie, token, request body with a password) to `expect()`: a failed assertion prints the whole value. Map it to names and flags first.
- **Test names** are in English, in the form `should <expected result> when <condition>`.

## Language

All documents and files in this repository are written in English: code, comments, test names, test plans in `specs/`, `CHANGELOG.md`, `CLAUDE.md` and commit messages. This applies even when the user writes in Russian; only chat replies follow the user's language. The one exception is UI text copied from the app into locators and assertions, which must match the app exactly.

## Changelog

Update `CHANGELOG.md` on every iteration that changes the project: add entries to the "Unreleased" section (in English, grouped as Added / Changed / Removed / Fixed / Known issues). When committing, move the finished entries into a new section headed `## YYYY-MM-DD — <commit message>` (a commit cannot contain its own hash); open issues stay under Unreleased.

## AI tooling (Playwright MCP + Test Agents)

`.mcp.json` defines two MCP servers. Both start via `cmd /c npx`, because on Windows a bare `npx` fails to launch (ENOENT):
- `playwright` — `@playwright/mcp`, pinned to 0.0.83, for driving a browser interactively
- `playwright-test` — `npx playwright run-test-mcp-server`, used by the Test Agents in `.claude/agents/`

The agents are `playwright-test-planner` (explores the app and writes a plan to `specs/`), `playwright-test-generator` (turns plan items into spec files) and `playwright-test-healer` (runs and fixes failing tests). `tests/ui/seed.spec.ts` is the seed test the agents start from; put shared setup there (login, navigation), not assertions.

Re-running `npx playwright init-agents` rewrites `.mcp.json` and drops the `playwright` server, so restore it afterwards.
