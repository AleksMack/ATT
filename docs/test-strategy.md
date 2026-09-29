# Test Automation Strategy: CTRM end-to-end flow

Status: DRAFT v0.1 (to be refined after PoC)
Updated: 2026-09-29
Owner: Alex
Companion documents: `SCENARIO.md` (business checklist of the demo flow), `roadmap-status.md` (progress), `CRM_Master_Data_Request_TESTDATA_v3.xlsx` (master data reference)

---

## 1. Goal

Build a maintainable automated test suite that proves a user can complete the full commodity and money flow in the CRM (CTRM) application, and that all documents are linked and all calculated values are correct.

The suite validates the application as a black box through its UI and public API (Swagger). No access to the application source code is required.

## 2. Scope

### In scope

1. **Master data (reference data)**: loaded from the master data workbook via API, verified by API tests.
2. **End-to-end flow** (one isolated run per execution):

   `contract -> purchase trade -> logistics -> warehouse -> sale -> invoice -> payment -> bank statement -> deal result`

3. **Business rules and calculations**: batch cost, unit cost, remaining stock, revenue, financial result, margin.
4. **Document linkage**: every document in the flow points to the correct previous document, product, vessel and batch.

### Out of scope (for now)

- Performance and load testing
- Security testing
- Cross-browser testing (Chromium only)
- Visual/pixel comparison
- CI/CD pipeline (planned later)
- Users and roles management (Users tab in the workbook is empty, see Open questions)

## 3. Tooling

| Layer | Tool |
|---|---|
| Test framework | Playwright Test 1.63 + TypeScript |
| UI tests | Playwright (Chromium), Page Object pattern |
| API tests and data setup | Playwright `APIRequestContext`, typed clients generated from Swagger |
| AI assistance | Claude Code in VS Code, Playwright MCP (pinned 0.0.83), Playwright Test Agents (planner, generator, healer) |
| Source control | GitHub, private repo `AleksMack/ATT` |
| Reporting | Playwright HTML report, trace/screenshot/video on failure |

**Why Playwright and not Postman:** the flow is a sequence of user actions in the browser (login, forms, validation, reports). Postman tests the API contract but cannot confirm that a user can complete the scenario in the application. API is used as a supporting layer.

## 4. Test layers

| Layer | Purpose | Examples |
|---|---|---|
| **API: master data** | Create and verify reference data. Fast and stable. | Counterparties, banks, accounts, vessels, ports, products |
| **API: support** | Prepare data for steps that are not the subject of the check; read backend values to compare with UI | Pre-create a contract for a warehouse-only test; read calculated cost from API |
| **UI: end-to-end flow** | Main proof that a user can complete the business flow | Steps 1-9 of the flow |
| **UI: critical checks** | Always checked in UI even if API is available | Bill of lading entry, price and cost calculation, deal result report |

Rule: if a step is the subject of the test, it is done through the UI. If a step is only a precondition, it may be done through the API.

## 5. Test data strategy

### 5.1 Two tiers of data

| Tier | What | Lifetime | Naming |
|---|---|---|---|
| **Tier 1: master data** | Reference data from the workbook (counterparties, banks, vessels, products, ports, etc.) | Permanent on the test environment. Loaded once, re-run safely. | Names exactly as in the workbook |
| **Tier 2: flow data** | Contract, trades, bills of lading, warehouse batches, invoices, payments, statements | Created per test run | Unique run ID, for example `AUTO_FLOW_20260929_1430` |

### 5.2 Source of master data

- Source: `CRM_Master_Data_Request_TESTDATA_v3.xlsx` (17 tabs).
- The workbook is converted into JSON files in the repo (`data/master/*.json`). Tests and seed scripts read JSON, not Excel.
- Workbook IDs (`CP-001`, `BNK-001`, `VSL-001`, ...) are **cross-reference keys only**. The seed script maps them to real system IDs returned by the API and stores the map in `data/master/id-map.<env>.json` (for example `id-map.uat.json`; not committed, environment-specific). The map is a by-product, not a source: seeds always resolve ids live from the API, and `npm run seed:map` rebuilds the map read-only after an environment change or reset.

### 5.3 Seed rules

- **Idempotent**: before creating a record, search it by natural key (name, SWIFT, IBAN, IMO, UN/LOCODE). If it exists, reuse it. Running the seed twice must not create duplicates.
- **If a reference record exists, do not create it.**
  - **Matching:** load the full list of the resource once (`GET <resource>/list`, page by page up to `totalRecordsCount`), compare the natural key **exactly** in code, and create only the missing records. API list filters are not used for this: they match by substring (for example, `FilterData.Name=Density` returns 8 characteristics).
  - **No updates:** an existing record is reused as is. The seed does not update it, even if other fields differ from the workbook.
  - **Where it lives:** every resource client in `api/` has `ensureAll()` (a batch against one loaded list) and `ensure()` (one record) that implement this rule. There is also an API test that calls `ensure()` twice and expects the same record and no new one (first case: `tests/api/master-data/physical-characteristics.spec.ts`).
- **Test-only records** (for example, a create/read/delete check of a resource) are not master data: they use the `AUTO_` prefix and are deleted at the end of the test.
- **Dependency order** (a record is created only after the records it references):

  1. Countries and currencies (if not predefined in the system)
  2. Counterparties
  3. Banks
  4. Bank accounts (needs counterparty, bank)
  5. Load and unload ports
  6. Terminals (needs port)
  7. Resources (needs terminal, port)
  8. Tankers / vessels (needs owner and operator counterparties)
  9. Shippers (needs counterparty, vessel, port)
  10. Characteristics
  11. Products and subproducts
  12. Product characteristics (needs subproduct, characteristic)
  13. Escalations (needs product characteristic)
  14. Platts quotations (needs subproduct)
  15. Projects and subprojects
  16. Project links (needs users, products, counterparties)
  17. Sample documents: numbering formats, used as reference for validation, not seeded unless the system has a configuration API for it

- **Two load profiles**:
  - `seed:minimal`: only the records needed for one flow run (2 counterparties: supplier and buyer, their banks and accounts, 1 vessel with owner and operator, 1 shipper, 2 ports, 1 terminal, 1 product with subproduct and characteristics). Used for PoC and daily runs.
  - `seed:full`: all records from the workbook. Used once per environment and after an environment reset.

### 5.4 Workbook data review (done 2026-09-29)

- Record counts: ~50 per tab, 101 bank accounts, 30 banks, 59 terminals, 61 Platts quotations, 58 document types.
- Cross-references between tabs are consistent (no missing IDs found).
- Useful negative data already in the workbook: 1 sanctioned vessel, 8 blocked bank accounts, 3 restricted and 2 inactive ports. These are used for negative tests (the system must not allow them in a flow).
- Currencies used in accounts: USD, EUR, CNY, AED, BRL, UZS, NGN.
- Gaps: see Open questions.

### 5.5 Flow data rules

- Every flow run creates its own contract and all downstream documents. Runs never share documents.
- All flow records include the run ID in a name or comment field, so they can be found and cleaned up.
- Cleanup: documents that the system allows to delete are deleted at the end of a successful run. Posted financial documents that cannot be deleted are left and identified by the `AUTO_` prefix.
- Failed runs keep their data for investigation.

## 6. End-to-end flow design

### 6.1 FlowContext

The flow is one `test.describe.serial` block. Each step stores what it created in a shared `FlowContext` object, which is also written to `test-results/flow-context.json` after each step (for debugging and for resuming from a failed step).

```
FlowContext
  runId
  purchaseContract   { id, number, product, supplier, volume, price, currency }
  purchase.trade     { id, number }
  logistics          { billOfLadingId, vesselId, freight }
  warehouse          { receiptId, batchId, volume }
  economics          { purchaseCost, freight, otherCosts, fullCost, unitCost }
  sale               { tradeId, billOfLadingId, shipmentId, volume, price }
  invoice            { id, number, amount, currency, status }
  payment            { id, amount, currency, status }
  bankStatement      { id, reconciliationStatus }
```

### 6.2 Steps and checks

| # | Step | Key checks |
|---|---|---|
| 1 | Contract | Unique contract created with supplier, product, volume, purchase price, currency |
| 2 | Purchase trade | Created from the same contract. Product, counterparty, volume, price, currency match the contract |
| 3 | Logistics | Bill of lading for the same trade, product and vessel. Freight entered for this vessel. BL -> trade link, product and volume match |
| 4 | Warehouse | Receipt operation. Batch with the same product, vessel and volume. Batch linked to the receipt. Cost calculated: `full cost = purchase cost + freight + other costs`. Unit cost and batch cost correct |
| 5 | Sale | Sales trade on the batch product. Sale volume cannot exceed available stock (negative test). Bill of lading and shipment done. Stock reduced by sold volume, remainder correct |
| 6 | Invoice | Invoice for the sales trade: same product, volume, amount. Invoice -> sales trade link, currency and amount match |
| 7 | Payment | Payment for the invoice: same amount and currency. After posting, invoice status changes per business rule, payment status confirmed |
| 8 | Bank statement | Statement imported or created for this payment. Statement -> payment link, amount, currency, reconciliation status |
| 9 | Deal result | Purchased, sold, remaining volume. Purchase cost, freight, other costs. Full batch cost and unit cost. Revenue. `result = revenue - full cost of sold volume`. Margin if calculated. All documents linked, no other batch or vessel involved |

### 6.3 Calculation checks (test oracle)

- Expected values are calculated **independently in the test** from the input data, then compared with the value shown in the UI. Where possible, also compared with the value returned by the API.
- Money is calculated with decimal arithmetic (no JavaScript floating point).
- Rounding rule and precision per currency and per unit must be confirmed by BA (see Open questions).
- Formulas are kept in one module (`utils/economics.ts`) so they are defined once and reviewed by BA.

## 7. Negative and boundary tests (after the happy path is stable)

- Sale volume greater than available stock is rejected
- Payment amount different from invoice amount: status per business rule (partial payment or rejection)
- Sanctioned vessel cannot be used in a bill of lading
- Blocked bank account cannot be used for payment
- Restricted or inactive port cannot be selected (or requires compliance clearance)
- Currency mismatch between invoice and payment is rejected

## 8. Repository structure and conventions

```
tests/
  setup/        login and session (auth.setup.ts)
  api/          master data and API tests
  ui/           end-to-end flow and UI tests
pages/          Page Objects, one class per screen
api/            typed API clients, one file per resource
data/master/    master data JSON converted from the workbook
scripts/        seed scripts, workbook-to-JSON converter
utils/          FlowContext, economics formulas, helpers
docs/           discovery notes, OpenAPI spec
```

Conventions (also in `CLAUDE.md`):

- Locators: `getByRole`, `getByLabel`, `getByTestId` first. CSS/XPath only as a last resort, with a comment.
- No hard waits (`waitForTimeout`). Use auto-waiting and `expect`.
- Tests call Page Object methods, not raw locators.
- Secrets only from `.env`, never printed or committed.
- Test names: `should <expected result> when <condition>`.

## 9. Execution

- Local runs from VS Code (Windows, later Mac).
- Workers: 1 (sequential) until data isolation is proven. The flow itself is always serial.
- Retries: 0 locally, 2 in CI (later).
- Evidence on failure: trace, screenshot, video, `flow-context.json`.
- CI (later): GitHub Actions, nightly run of `seed:minimal` + full flow, secrets in GitHub Secrets.

## 10. Role of AI

| Task | Who |
|---|---|
| Explore screens, find locators, draft Page Objects and tests | Claude Code + Playwright MCP, Test Agents (planner, generator) |
| Fix broken locators after UI changes | Test Agent healer, reviewed by a human |
| Business rules, expected values, formulas | Human (QA/BA). AI must not invent expected results |
| Review and merge | Human |

Rule: a test is accepted only after a human checked that the assertions match the business rule, not only that the test is green.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Shared test environment, other users change data | Unique run ID, own data per run, read-only use of master data |
| Posted financial documents cannot be deleted | `AUTO_` prefix, periodic cleanup by environment reset |
| Long flow is fragile: one failure blocks later steps | FlowContext saved after each step, ability to start from a later step using API-prepared data |
| UI changes break locators | Page Objects, stable locators, `data-testid` request to developers, healer agent |
| Calculation rules unclear | Formulas confirmed by BA before automation, kept in one module |
| Claude Pro usage limits | Plan work in sessions, upgrade after PoC if needed |

## 12. Open questions

All open questions (master data, API, business rules, environment) are tracked in one place: [`docs/open-questions.md`](open-questions.md). The questions that were listed here are Q-07, Q-08, Q-14 to Q-21 there; the resolved ones are R-02, R-03 and R-07.

## 13. PoC exit criteria

- Login and session stable (done)
- `seed:minimal` runs twice without duplicates
- API CRUD test for one master data resource is green
- Flow steps 1-4 (contract to warehouse cost) pass through UI 5 times in a row
- Batch cost check passes against the independent calculation
- Measured effort per step, used for the Estimate

## 14. Next steps

1. Convert workbook to JSON and implement `seed:minimal` via API
2. PoC: flow steps 1-4
3. Update this strategy with PoC results (v1.0)
4. Estimate and backlog
