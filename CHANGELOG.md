# Changelog

All notable changes to this project are recorded in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). New entries go at the top, under "Unreleased", until the changes are committed; then they move to an entry headed with the commit date and message.

## [Unreleased]

### Known issues
- 14 escalations are not created (ESC-013, 014, 015, 021, 026, 028, 031, 032, 036, 040, 041, 043, 044, 050): their names are already used by other rows of tab 10, and the system requires unique escalation names. Waiting for BA (open question Q-26).
- CP-023 "Samarqand Energiya", its 2 bank accounts (ACC-0047, ACC-0048) and vessel VSL-013 "Bohai Legend" (CP-023 is the operator) are not created: its abbreviation "SE" is already used by CP-014 "Santos Energia", and counterparty abbreviations must be unique (`errorCode` 16).
- 6 banks got the first city of their country because their city is not in the geo list or is spelled differently (BNK-002, 005, 008, 010, 012, 016). Their city in the system is wrong until the workbook or the geo list is aligned.
- The HTML report of the UI `setup` project shows the password and OTP in step titles (`Fill "<value>"`). Trace and video being off does not prevent it. The leaking local report was deleted; `setup` needs a fix before its report is shared.

## 2026-09-29 — Add counterparties, bank accounts, vessels and escalations seed; open questions

### Added
- `docs/open-questions.md`: one list of all open questions (Q-01 to Q-25: master data, API, business rules, environment) and the resolved ones (R-01 to R-07). The lists in `docs/test-strategy.md` (section 12) and `docs/discovery.md` now point to it; rule added to `CLAUDE.md`.
- `npm run seed:clear` (`scripts/clear-seed-marks.ts`, `clearAllMarks()`): removes every green / red seed fill and empties all "... seed status" columns in the workbook; values and fonts are kept.
- `npm run seed:all`: `seed:clear`, then all seeds with all records, in dependency order (characteristics, products, subproducts, shippers, banks, legal forms, projects, subprojects).
- `api/clients.ts`: typed client for "Контрагенты" (API resource `clients`); matched by legal name.
- `scripts/seed-clients.ts` (`npm run seed:clients [-- --limit N]`, default 1; part of `seed:all` after legal forms): counterparties from tab 1. counterpartyKind = 1 if Group Company is "Yes", else 0; counterpartyTypes [1], kycStatus 0, creditLimit 0, role 0, useForSendingOriginals true; legal form by name; country and city as for banks. Also sends `legalFormAbbreviationRUS` and `role`, which the UI sends although Swagger does not list them.
- `api/clientAccounts.ts`: typed client for counterparty bank accounts (`clients/accountslist`, `createaccount`, `getaccountbyid`, `deleteaccount`); matched by account number (IBAN is "N/A" for 50 of 101).
- `scripts/seed-client-accounts.ts` (`npm run seed:client-accounts [-- --limit N]`, default 1; in `seed:all` after clients): accounts from tab 3. Client via Counterparty ID -> tab 1 name -> clients list; bank via Bank ID -> tab 2 SWIFT/BIC -> banks list. IBAN "N/A" -> null; currency code from user/dictionary; Active -> status 0, Blocked -> 1 (frozen); accountType 0; statusDate 2020-09-01 for all.
- `api/vessels.ts`: typed client for "Суда"; the natural key is the IMO number.
- `scripts/seed-vessels.ts` (`npm run seed:vessels [-- --limit N]`, default 1; in `seed:all` after accounts): vessels from tab 4. imoNumber = digits of "MO #", isCollector = Storage "Yes", flag by country name, owner and operator via tab 1 -> clients list. Type / Vessel Type, Sanction Status and Status are not sent.
- `api/escalations.ts`: typed client for "Эскалации"; one workbook row = one escalation (key: characteristic + name + comment).
- `scripts/seed-escalations.ts` (`npm run seed:escalations [-- --limit N]`, default 1; in `seed:all` after subproducts): escalations from tab 10. escalationType 3 for Direction "Above", 2 for "Below" (values given by the team); priceIncrease true for Penalty, false for Premium and Rejection; productCharacteristicId = characteristic id via tab 7; comment = Notes; defaultTop false, defaultStep null.
- Escalation seed on uat: 50 rows, 36 created, 14 not created: escalation names must be unique in the whole list (`errorCode` 2), and tab 10 reuses 7 names (see Known issues).
- Vessel seed on uat: 50 rows, 48 created, 1 already existed (VSL-001), 1 error (VSL-013: operator CP-023 is not in the system). No duplicate IMO numbers; 7 vessels with isCollector = true.
- Account seed on uat: 101 rows, 98 created, 1 already existed (ACC-0001), 2 errors (ACC-0047, ACC-0048: client CP-023 is not in the system). Checked in the system: no duplicates, all 8 Blocked accounts have status 1, all 48 created "N/A" accounts have no IBAN. The workbook shows "exists" instead of "created" for the 98, because the seed was run a second time by mistake.
- Counterparty seed on uat: 50 rows, 48 created, 1 already existed (CP-001), 1 error (CP-023, see Known issues). 12 cities not matched exactly (closest or first of country), noted in the status column.
- First full seed on uat (empty stand): 51 characteristics, 14 products, 23 subproducts, 32 shippers (50 rows), 30 banks, 14 legal forms, 6 projects, 50 subprojects created; no errors. All 7 API tests pass on uat.

## 2026-09-29 — Add shippers, banks, projects and legal forms seed; switch to uat

### Changed
- Test environment switched from qa01 to uat: `BASE_URL=https://uat.ctrm.biz`, `API_URL=https://uat-api.ctrm.biz/api/`, new user in local `.env`. The uat Swagger is identical to the saved `docs/openapi.json` (994 paths, same schemas). API login, the read-only API tests and UI login pass on uat.
- `ProjectsApi.listSubprojects()` uses `GET projects/subprojects?FilterData.Id=<parent id>`.

### Added
- `api/shippers.ts`: typed client for "Грузоотправители" (list, listAll, getById, create, delete, ensureAll).
- `scripts/seed-shippers.ts` (`npm run seed:shippers`): shippers from tab 5, name = Shipper Name only. A name repeated in the tab (one row per shipper and vessel) is created once; the repeats get "exists" with the same id.
- `api/geo.ts`: country id by English name; city by exact name, else the first search result, else the first city of the country.
- `api/banks.ts`: typed client for "Банки"; the natural key is SWIFT/BIC (`ensureAllByKey`).
- `scripts/seed-banks.ts` (`npm run seed:banks [-- --limit N]`, default 1): banks from tab 2 (names, abbreviation, SWIFT/BIC, INN, street, building, country and city via `GeoApi`). A city that is not matched exactly is noted in the status column.
- `api/projects.ts`: typed client for "Проекты".
- `scripts/seed-projects.ts` (`npm run seed:projects [-- --limit N]`, default 1): projects from tab 6 (Project Name (Region) -> name, Project ID -> code, the earliest Start Date among the project's rows -> startDate).
- `toIsoDate()` in `scripts/master-data/workbook.ts`: Excel date cells as "YYYY-MM-DD".
- `ProjectsApi.listSubprojects()` (`GET projects/subprojects?FilterData.Id=<parent id>`; subprojects are not in projects/list), `deleteSubproject()` and `ensureAllSubprojects()` (key: parent id + name).
- `scripts/seed-subprojects.ts` (`npm run seed:subprojects [-- --limit N]`, default 1): subprojects from tab 6 (Subproject Name -> name, Subproject ID -> code, the row's Start Date, parent by Project ID).
- `api/legalForms.ts`: typed client for "Организационно-правовые формы".
- `scripts/seed-legal-forms.ts` (`npm run seed:legal-forms [-- --limit N]`, default 1): one legal form per distinct Legal Form (ENG) in tab 1; name = abbreviation = Legal Form (ENG), name_RUS = abbreviation_RUS = Legal Form (RUS). Marks the legal form columns in every counterparty row with that form.
- Legal form seed on qa01: 14 of 14 (13 created, "S.p.A." already existed from the first check, id 4); no errors.
- First subproject check on qa01: PRJ-001-01 "United Arab Emirates" created (id 18, parent Middle East Gulf 12).
- Project seed on qa01: 6 of 6 created (PRJ-001 to PRJ-006, ids 12-17), start date = the earliest Start Date of each project; no errors.
- Bank seed on qa01: 30 of 30, 29 created, 1 already existed (BNK-001 "Al Noor Bank", id 5); no errors. 10 cities not matched exactly: 4 took the closest search result (Sharjah -> "Sharjah city", Navoi -> "Navoiy City"), 6 took the first city of the country (Ras Al Khaimah -> Abu Dhabi, Port Harcourt -> Aba, Zhoushan -> "`Aqqan", Samarkand -> Almalyk).
- Shipper seed on qa01: 50 rows, 32 distinct names; 31 created, 1 already existed ("Zhoushan Haitong Storage Co., Ltd.", id 4); no errors.

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
