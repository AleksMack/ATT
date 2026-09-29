# Discovery notes

Black-box discovery of the OptiFlow CRM (oil trading) test stand at `https://ba01.ctrm.biz`, done on 2026-09-29. Client version 0.37.35478, API version 0.37.35494. No tests were written.

## 1. Swagger / OpenAPI spec: not found

`docs/openapi.json` was **not** created, because no spec could be found.

- **Common paths return the app, not a spec.** All of them on `BASE_URL` (`/swagger`, `/swagger/index.html`, `/swagger/v1/swagger.json`, `/api/docs`, `/openapi.json`, `/v3/api-docs`, plus `/swagger.json`, `/api-docs`, `/redoc`, `/swagger-ui.html` and `/api/...` variants) answer `200 text/html`. That is the Angular app's `index.html` served for any unknown path. The result is the same with `Accept: application/json` and with a logged-in session.
- **`API_URL` in `.env` points nowhere.** The key is still named `API_BASE_URL`, and it points to `http://localhost:3000/api`, where nothing is running. It is a leftover placeholder.
- **No other host found.** The usual API/Swagger hosts (`api.`, `ba01-api.`, `api-ba01.`, `swagger.`, `docs.` on `ctrm.biz`) do not resolve, and ports 5000/5001/8080/8443/3000 are closed.
- **The server is IIS** (`Server: Microsoft-IIS/10.0`), so the backend is most likely ASP.NET. If Swagger exists, it is disabled on this stand or published at a URL we don't know.

**Action needed:** ask the team for the Swagger URL, or for the JSON file itself. Until then, the resource list below was reconstructed from the frontend JavaScript bundle (the `endpointsBase` of every Angular data service) and checked with live GET calls.

## 2. API resources by module

### How the API is shaped

- **Location:** same origin as the UI, no `/api` prefix: `https://ba01.ctrm.biz/<resource>/<action>`.
- **Response envelope:** every response is `{ data, error: { errorCode } }`; `errorCode` 0 means success. The shapes below describe `data`.
- **Generic CRUD base service** (most resources):
  - `GET <resource>/list`: paged list. Query params `pageIndex` and `pageSize`. Returns `{ totalRecordsCount, filteredRecordsCount, pageIndex, records[] }` (some lists also have `additionalData`).
  - `GET <resource>/getbyid`
  - `POST <resource>/create`, `POST <resource>/update`, `POST <resource>/delete`. Changes are POST only; `POST .../list` returns 500.
  - Some services override the action names, e.g. `clients`: `createcontact`, `contactslist`, `accountslist`.
- **Workflow actions** on transactional resources: `process`, `approve`, `cancel`, `complete`, `finalize`, `changestatus`, `updatestatus`, `addcomment`, `commentlist`, and sections like `maininfo/update`, `productinfo/update`, `pricesetting/update`.
- **System enumerations:** `GET user/dictionary` returns a read-only set used by all forms: `currencies`, `countries`, `incoterms`, `dealTypes`, `dealStatuses`, `dealDirections`, `counterpartyTypes`, `counterpartyKinds`, `productMeasures`, `pricingTypes`, `quotationTypes`, `payment*` types, and others. These are not editable reference data.

**Legend:** 📘 = reference data (dictionary). Per the conventions, create it via API, never via UI.

### Reference data (menu "Справочники")

| Menu group | Screen (UI) | Resource | |
|---|---|---|---|
| Trading | Продукты | `products`, `productreferences` | 📘 |
| Trading | Проекты | `projects` | 📘 |
| Trading | Характеристики | `physicalcharacteristics` | 📘 |
| Trading | Котировки | `productquotations` (+ `quotations-import`) | 📘 |
| Trading | Эскалации | `escalation` | 📘 |
| Logistics | Логистические объекты | `logisticobjects`, `ports`, `terminals`, `stations` | 📘 |
| Logistics | Суда | `vessels` | 📘 |
| Finance | Банки | `banks`, `bankgroups` | 📘 |
| Finance | Категории платежей | `cfcategories`, `cfsubcategories`, `cfitems` | 📘 |
| Finance | Несвязанные счета | `unlinkedaccounts` | 📘 |
| General | Контрагенты (counterparties) | `clients` (+ `clients/address`, contacts, accounts), `clientgroups` | 📘 |
| General | Регионы | `regions` | 📘 |
| General | Календари | `calendars` route (no separate data service found) | 📘 |
| General | Операции | `customoperationtypes` | 📘 |
| General | Типы костов | `costtypes` | 📘 |
| Other | Направления | `directions` | 📘 |
| Other | Места перехода права собственности | `transferoftitleplaces` | 📘 |
| Other | Станции погранперехода | `bordercrossingstation` | 📘 |
| Other | Принадлежность вагона | `wagonownership` | 📘 |
| Other | Грузоотправители | `shippers` | 📘 |
| Other | Точки перегрузки | `overloadpoints` | 📘 |
| Other | Основания перехода права собственности | `transferofbasis` | 📘 |
| Other | Организационно-правовые формы | `legalforms` | 📘 |
| Finance | Курсы валют / Системные курсы валют | `exchangerates`, `systemexchangerates` | 📘 market data |
| — | Tax types | `taxtypes` | 📘 |

### Trading

| Resource | Purpose |
|---|---|
| `deals`, `dealdraftversion` | Deals and their draft versions (version setup / compare / approve) |
| `contracts`, `contracts/positions`, `contractpositionpricing` | Contracts, positions and position pricing |
| `lots`, `lotpricing`, `batches` | Lots, lot pricing, batches |
| `streams`, `showcase` | Trading streams ("Поток") and showcase |
| `warehouse` | Stock by location / tank / product ("Склад") |
| `balancetrade`, `conversion`, `counterpartiesops`, `resources` | Trade balance, unit conversion, counterparty operations, resources |

### Logistics

| Resource | Purpose |
|---|---|
| `voyages`, `voyageroutepoints` | Voyages ("Рейсы") and route points |
| `laycan`, `delivery` | Tanker laycans ("График танкеров"), delivery |
| `operations/*` | Operations: `freight`, `demurrage`, `insurance`, `realization` (+ `batches`), `registration`, `transfer`, `customlogistic` |
| `insuranceoperations`, `vesseldraining`, `railtankcars` | Insurance, vessel draining, rail tank cars |

### Documents

| Resource | Purpose |
|---|---|
| `billofladings`, `billoflading/cargobookings` | Bills of lading ("Коносаменты") |
| `railwaybills` | Railway bills (RWB) |
| `dischargedocuments`, `qualityinspectiondocuments`, `tradedocuments` | Discharge, quality inspection and trade documents |

### Finance

| Resource | Purpose |
|---|---|
| `invoices` | Incoming / outgoing invoices |
| `plannedpayments`, `paymentschedule`, `paymentsettings/balance`, `paymentsettings/other` | Planned payments (approve / reject), payment schedule and terms |
| `financialtransactions`, `bankstatements`, `offsets`, `thirdpartypayments` | Transactions, bank statements, offsets, third-party payments |
| `cashflowaggregation`, `provisionalcashflowaggregation` | Cash-flow plan |
| `costs` | Costs |

### Administration and system

| Resource | Purpose |
|---|---|
| `user`, `spaces`, `spaceusers`, `spacerules`, `systemsettings` | Users, roles, spaces, system settings |
| `login` | `checkloginpassword`, `sendotp`, `loginotp` |
| `notifications`, `messages`, `events`, `changelog`, `entitylock`, `geoobjectsearch` | Service endpoints |

## 3. API authentication

- **Two login calls:** `POST login/checkloginpassword`, then `POST login/loginotp` (OTP step).
- **Tokens live in cookies:** the server sets two **httpOnly cookies** on the app domain:
  - `AccessToken`: lives **10 minutes**
  - `RefreshToken`: lives **90 days**
- **No bearer token:** there is no `Authorization` header, and localStorage only holds `activeUserId`.
- **Without cookies** the API answers `401`, and the frontend then redirects to the login page. There is no separate refresh endpoint in the frontend.
- **Refresh is server-side:** a request with an expired `AccessToken` and a valid `RefreshToken` still succeeds (`200`), and the response sets fresh `AccessToken` and `RefreshToken` cookies.

**The saved UI session can be reused for API calls.** The cookies in `playwright/.auth/user.json` work in a Playwright `APIRequestContext` (`storageState`), even after the access token has expired. Changes needed in `playwright.config.ts` before writing API tests:

- In `.env`, set `API_URL=https://ba01.ctrm.biz` (same origin, no `/api`), and use `https` in `BASE_URL` too (http redirects to https).
- Give the `api` project `storageState: AUTH_FILE` and `dependencies: ['setup']`.
- The session stays valid while the refresh token lives (90 days), but `setup` runs before every test run anyway.

## 4. UI: modules and key screens

The main menu opens from the first icon button in the header. It is a dialog with a search box ("ПОИСК") and six sections. The buttons with counters in the header ("Документация 1", "Трейдинг 3", "Финансы 2", "Логистика 3") are **not** navigation: they are the user's pinned recent items (`usersettings/pindata`) and differ per user.

All screens live under `/pages/<screen>/list`.

| Section | Screens |
|---|---|
| Документы | RWB, Коносаменты, Слив с танкера, Отгрузочные документы |
| Финансы | Инвойсы, Корзина инвойсов, Плановые платежи, Банковские выписки, Банковские Транзакции, Курсы валют, Системные курсы валют, Финансовые операции, Отчеты |
| Логистика | График танкеров, Отчет по танкеру, Рейсы, Страхование |
| Трейдинг | Документы, Сделки, Склад, Котировки |
| Справочники | Trading, Logistics, Finance, General, Other (see section 2) |
| Администрирование | Пользователи, Роли, Пространства, Системные параметры, Данные рынка |

Key screens checked:

| Screen | Route | Columns / actions |
|---|---|---|
| Сделки (deals) | `/pages/deals/list` | Name, seller, buyer, type, trader, operator, resource, delivery period, **volume**, delivery basis, status. Action: "Создать" (create) |
| Склад (warehouse) | `/pages/warehouse/list` | Country, location, tank, product, sub-product, resource, **volume** |
| Инвойсы (invoices) | `/pages/invoices/list` | From, to, number, **invoice amount**, **invoice amount USD**, due date, paid date, file. Actions: "Входящий инвойс" (incoming invoice), "Исходящий инвойс" (outgoing invoice) |
| Создание инвойса (invoice setup) | `/pages/invoices/setup` | Number (auto, read-only), type, invoice date, due date, from, to, currency |
| Курсы валют (exchange rates) | `/pages/exchange-rates/list` | Matrix: target currency × source × day |
| Плановые платежи (planned payments) | `/pages/planned-payments/list` | Date, type, status, payee / payer with banks and accounts, deal, **payment amount**, invoices. Actions: "Утвердить" (approve), "Отклонить" (reject) |
| Рейсы (voyages) | `/pages/voyage/list` | Number, vessel, route, freight, dates, status. Action: "Рейс" (voyage) |

**Notes for UI tests:**

- **Locators:** there are no `data-testid` attributes. Most header icon buttons have no accessible name, so they need a stable role/position locator, or a request to developers to add `aria-label`.
- **Direct URLs don't work:** `/deals` returns `page-not-found`. Use `/pages/deals/list` or go through the menu.
- **The UI is in Russian;** the i18n files `assets/i18n/ru.json` and `en.json` exist, and the language is a user setting.

## 5. Candidate PoC scenarios (UI e2e)

All three follow the conventions:

- reference data is created via API with the `AUTO_` prefix;
- the flow under test runs in the UI;
- everything created is deleted at the end.

### A. Outgoing invoice: total and USD amount (recommended)

- **Steps:**
  1. Via API: create a seller and a buyer counterparty (`clients`), and make sure an exchange rate for the invoice date exists (`exchangerates`).
  2. In the UI: Финансы → Инвойсы → "Исходящий инвойс". Fill in the dates, from / to and currency (e.g. EUR), add lines (quantity × price), save.
- **Verify:**
  - the invoice total equals the sum of `quantity × price` over the lines;
  - in the list, "Сумма инвойса USD" equals the total converted at the rate for the invoice date.
- **Why:** short (one form); business-critical (billing); two calculated values; few dependencies.
- **Risk:** the invoice-line step and the rounding rules are not confirmed yet.

### B. Planned payment from an invoice: amount and approval

- **Steps:**
  1. Via API: counterparties, bank and accounts; an invoice.
  2. In the UI: Финансы → Плановые платежи. Create a payment for the invoice, then "Утвердить" (approve).
- **Verify:** the payment amount equals the unpaid invoice amount (or the chosen percentage of it), and the status changes to approved.
- **Why:** checks the money flow and a status workflow.
- **Risks:**
  - more setup data (banks, accounts);
  - the approval may need a second user or role.

### C. Deal volume and pricing

- **Steps:**
  1. Via API: counterparties, product, delivery basis, and quotations for the pricing period (`productquotations`).
  2. In the UI: Трейдинг → Сделки → "Создать". Set a volume and a pricing formula (average quotation over the period + premium).
- **Verify:** the calculated price equals the average of the quotations plus the premium, and the deal value equals volume × price.
- **Why:** the core business of an oil-trading CTRM.
- **Risks:**
  - the deal form is the most complex (versions, draft / approve, pricing settings);
  - it depends on many dictionaries, so it is less stable for a first PoC.

**Recommendation:** start with **A**. It has the fewest dependencies, the shortest UI path and two independent calculated checks. Then **B** reuses its invoice.

## Open questions

Moved to [`docs/open-questions.md`](open-questions.md) (Q-15, Q-17, Q-23, Q-24; the Swagger question is resolved as R-01).

## Method

- **Login page:** explored with Playwright MCP.
- **Logged-in screens:** explored with throwaway Playwright scripts outside the repo. Loading the saved session into the MCP browser was blocked by Claude Code's auto-mode safety check (it counts as passing credentials to another process), so the scripts logged in with the `.env` credentials themselves, never printing them.
- **API resources:** extracted from the frontend JavaScript bundle and checked with read-only GET calls.
- **Nothing was created or changed** on the stand.
