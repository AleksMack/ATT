# Changelog

All notable changes to this project are recorded in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). New entries go at the top, under "Unreleased", until the changes are committed; then they move to an entry headed with the commit date and message.

## [Unreleased]

### Known issues
- The HTML report of the UI `setup` project shows the password and OTP in step titles (`Fill "<value>"`). Trace and video being off does not prevent it. The leaking local report was deleted; `setup` needs a fix before its report is shared.

## 2026-09-29 — Add products and subproducts seed

### Added
- `api/referenceData.ts`: shared `ensureAllByName()`, `ensureOne()` and `listAllPages()` for every reference data client.
- `api/products.ts`: typed client for "Продукты" (top-level products: list with `FilterData.IsProduct=true`, listAll, getById, create, delete, ensureAll).
- `scripts/seed-products.ts` (`npm run seed:products`): products from tab 8 (Product Name -> name, Product ID -> abbreviation, Description -> comment, Characteristic ID -> characteristics via tab 7). Marks columns A-B of tab 8 with a "Product seed status" column.
- `scripts/seed-subproducts.ts` (`npm run seed:subproducts [-- --limit N]`, default 1): subproducts from tab 9 (Subproduct -> name, Subproduct ID -> abbreviation, parent by Product ID, all characteristics of the subproduct's rows via tab 7, `subproductType` 0). Marks the subproduct columns of tab 9 with a "Subproduct seed status" column.
- `scripts/master-data/characteristicLinks.ts` (Characteristic ID -> tab 7 name -> id in the system) and `scripts/master-data/report.ts` (shared result printing and row statuses).
- `ProductsApi.listAllSubproducts()` / `ensureAllSubproducts()`: subproducts are matched by parent id + name (`ensureAllByKey()`).
- Reseed on qa01 after the stand was cleaned and the workbook restructured (product characteristics and comment moved to tab 8, CH-000 "Density" added to tab 7): 51 of 51 characteristics (CH-000 id 130), 14 of 14 products with CH-000 and comment (ids 49-62), 23 of 23 subproducts from tab 9 with all their characteristics (PRD-01-02 "Upper Zakum" id 65, then 22 more; no errors). Subproducts may have characteristics that their parent product does not have.

### Changed
- `api/physicalCharacteristics.ts` uses the shared reference data helpers (same behaviour).
- `markRows()` takes options: key column, status column name, columns to color (several rows may share a key).
- Seed scripts print the result before writing the workbook, so it is shown even if the workbook is open in Excel.
- `markRows()` clears the previous marks of the tab before marking, so the colors show only the current run (values and fonts are kept).
- `seed-products.ts` links a product's characteristic by Characteristic ID (tab 9 -> tab 7 name -> id in the system), not by the name in tab 9, which may be outdated.

### Fixed
- Seed scripts check that the workbook is writable before any API call (`assertWorkbookWritable()`); if it is open in Excel they stop with "Nothing was sent to the API", so results are never lost.
- `seed-subproducts.ts` sent only the first characteristic of a subproduct; it now sends all of them (Upper Zakum has 4).
- `tests/api/login.spec.ts`: unique unknown user per run. The server locks a user name after several failed logins (`errorCode` 100009), even for a user that does not exist, which broke the test on repeated runs.

## 2026-09-29 — Switch to qa01, add login tests and characteristics seed

### Added
- `docs/openapi.json`: OpenAPI 3.0.4 spec (`ConceptOil.API`, 994 paths) from `https://qa01-api.ctrm.biz/swagger/v1/swagger.json`.
- `tests/api/login.spec.ts`: valid login returns `userId` and httpOnly `AccessToken` / `RefreshToken` cookies; an unknown user gets `errorCode` 100002 and no session.
- Rule in `CLAUDE.md`: never pass objects holding secrets to `expect()`.
- `api/physicalCharacteristics.ts`: typed client for "Характеристики" (list, listAll, findByName, getById, create, delete) with `ensureAll()` / `ensure()`: load the full list once, compare names exactly, create only the missing records.
- `data/master/characteristics.json`: CH-001 "Density @ 15°C" from the master data workbook.
- `tests/api/master-data/physical-characteristics.spec.ts`: `ensure()` does not create a duplicate; create/read/delete of an `AUTO_` record; a name longer than 20 characters is rejected.
- `scripts/seed-characteristics.ts` (`npm run seed:characteristics`): seeds tab "7. Characteristics" (Characteristic Name -> name, Description -> comment), rewrites `data/master/characteristics.json`, and marks workbook rows green (in the system) or red (not created / error) with a "Seed status" column.
- `scripts/master-data/workbook.ts`: read a workbook tab by header row, mark rows green / red.
- Dev dependencies `exceljs` (workbook read/write) and `tsx` (run TypeScript scripts).
- First seed on qa01: 39 characteristics created (ids 22-60), 1 already existed (CH-001, id 11), 10 rejected because the name is longer than 20 characters.
- `docs/test-strategy.md`: rule "if a reference record exists, do not create it" (exact match, no updates, `ensure()` per resource) and open question 11 (20-character name limit).

### Changed
- Test environment switched from ba01 to qa01: `BASE_URL=https://qa01.ctrm.biz`, `API_URL=https://qa01-api.ctrm.biz/api/` (local `.env`).
- `apiLogin()`: one call `POST login/loginotp` with `{ user, password, oneTimePassword }` as in Swagger (was `checkloginpassword` + `loginotp` with `otpPasswordType`).
- `apiBaseUrl()` adds a trailing slash to `API_URL`, so relative paths keep the `/api` prefix.
- `auth.setup.ts`: the dashboard is detected by the "Concept Oil" logo instead of the user's pinned "Трейдинг" button.

### Fixed
- `apiLogin()` now fails on a non-zero `errorCode`: wrong credentials return HTTP 200 with `errorCode` 100002, which was treated as success.

- `docs/CRM_Master_Data_Request_TESTDATA_v3.xlsx`: master data workbook (all data, including IBANs, is fictional), with seed status on tab 7.

## 2026-09-29 — Add test strategy

### Added
- `docs/test-strategy.md`: test automation strategy (draft v0.1): scope, test layers, two-tier test data, end-to-end flow design, PoC exit criteria.

## 2026-09-29 — Add API login and client

### Added
- `api/auth.ts`: `apiLogin()` logs in through the API without a browser (`login/checkloginpassword` + `login/loginotp`) and saves the session cookies to `playwright/.auth/api-state.json`.
- `api/client.ts`: `ApiClient` that reuses the saved state for all requests, with `ApiEnvelope` and `PagedList` types and `getData()` / `postData()` that unwrap `{ data, error }`.
- `utils/env.ts`: `requireEnv()`, fails with the names of missing `.env` keys only.
- `tests/api/auth.spec.ts`: API login gives 200 and a JSON list on `clients/list`; a request without a session gives 401.

### Changed
- `api` project: trace turned off, because it would record the login request body.

### Fixed
- `docs/discovery.md`: API responses are wrapped in `{ data, error }`; this was missing.
- Local `.env` keys renamed to `USER_LOGIN`, `USER_PASSWORD`, `USER_OTP`, `API_URL` (`https://ba01.ctrm.biz`), and `BASE_URL` switched to https (the file itself is not committed).

## 2026-09-29 — Add discovery notes

### Added
- `docs/discovery.md`: Swagger search results (not found), API resources by module with reference data marked, API authentication (httpOnly cookies, server-side refresh, UI session reusable for API), main menu and key screens, three PoC scenario candidates and open questions.
- API facts and the `docs/` folder in `CLAUDE.md`.

## 2026-09-29 — Add conventions to CLAUDE.md

### Added
- "Conventions" section in `CLAUDE.md`: Page Objects, locator priority, no hard waits, self-contained test data with the `AUTO_` prefix, typed API helpers in `api/`, reference data via API, secrets only from `.env`, test naming `should <expected result> when <condition>`.

## 2026-09-29 — Add login setup, changelog and language rule

### Added
- `CHANGELOG.md`: a log of changes, updated on every iteration.
- A rule in `CLAUDE.md` to keep `CHANGELOG.md` up to date.
- A rule in `CLAUDE.md` that all documents and files are written in English.
- `tests/setup/auth.setup.ts`: logs in with `USER_LOGIN`, `USER_PASSWORD` and `USER_OTP` (Login/Password → "Use OTP from the app" → OTP), waits for `/dashboard` and the main menu, and saves the session to `playwright/.auth/user.json`.
- `USER_OTP` key in `.env.example`.
- `/.playwright-mcp/` (Playwright MCP output) in `.gitignore`.

### Changed
- `setup` project: trace and video are turned off so the password and OTP are never recorded; the failure screenshot is kept.

## 2026-09-29 — `cc63b71` Add Playwright MCP and Test Agents

### Added
- `.mcp.json` with two MCP servers, both started via `cmd /c npx` (on Windows a bare `npx` fails to start with ENOENT):
  - `playwright`: `@playwright/mcp`, pinned to version 0.0.83;
  - `playwright-test`: `npx playwright run-test-mcp-server`, used by the agents.
- Playwright Test Agents for Claude (`npx playwright init-agents --loop=claude`): `planner`, `generator` and `healer` in `.claude/agents/`.
- `specs/`: folder for the planner agent's test plans.
- `tests/ui/seed.spec.ts`: the seed test the agents start from (empty for now).
- A section about the AI tooling in `CLAUDE.md`.

### Removed
- `.github/` (GitHub Actions workflow): CI will be set up later. The folder was never committed.

## 2026-09-29 — `6569696` Project setup

### Added
- `playwright.config.ts`: loads `.env` via dotenv, `baseURL` from `BASE_URL`, Chromium only, `workers: 1`, trace, screenshot and video kept only on failure, list and html reporters.
- Three projects: `setup` (`tests/setup/*.setup.ts`, saves the session to `playwright/.auth/user.json`), `ui` (`tests/ui`, depends on `setup`, uses the saved session if the file already exists), `api` (`tests/api`, `baseURL` from `API_URL`).
- Folders `tests/ui`, `tests/api`, `tests/setup`, `pages`, `data`.
- `.env.example` with the keys `BASE_URL`, `API_URL`, `USER_LOGIN`, `USER_PASSWORD`.
- `.gitignore`: `node_modules`, `.env`, `playwright/.auth`, `test-results`, `playwright-report`, `blob-report`.
- `CLAUDE.md` describing the project for Claude Code.

### Removed
- The Playwright example `tests/example.spec.ts`.
- The empty file `1` from the initial commit.

## 2026-09-29 — `50a3413` Initial commit
