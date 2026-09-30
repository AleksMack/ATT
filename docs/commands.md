# Commands

How to run the tests and the master data seeds from a terminal (VS Code terminal, PowerShell or cmd). Run every command from the project folder:

```bash
cd D:\ATT
```

Setup of a fresh checkout: `npm ci`, then `npx playwright install chromium`, then fill `.env` (keys in `.env.example`).

## Automated tests (Playwright)

**All tests** (UI login, API session, API tests):

```bash
npx playwright test
```

**By project:**

```bash
npx playwright test --project=api      # API tests (the API session is prepared first)
npx playwright test --project=setup    # UI login only (saves the browser session)
```

**One file:**

```bash
npx playwright test tests/api/login.spec.ts
npx playwright test tests/api/auth.spec.ts
npx playwright test tests/api/master-data/physical-characteristics.spec.ts
```

**One test, by (part of) its name:**

```bash
npx playwright test -g "should return 401"
npx playwright test -g "longer than 20 characters"
```

**Results:**

```bash
npx playwright test --project=api --reporter=list   # one line per test in the terminal
npx playwright show-report                          # HTML report of the last run
npx playwright test --list                          # list the tests without running them
```

**UI in a visible browser:**

```bash
npx playwright test --project=setup --headed
```

> The HTML report of the UI login still shows the password in step titles (open question Q-25). Do not share that report.

## Master data seeds

These commands **create data on the test environment** (the one in `.env`, now uat) and write the result into the workbook `docs/CRM_Master_Data_Request_TESTDATA_v3.xlsx`:

- green row = the record is in the system;
- red row = not created, with the reason in the "Seed status" column.

**Close the workbook in Excel before running a seed**, otherwise the script stops before sending anything to the API.

### Everything at once

```bash
npm run seed:all     # clear the workbook marks, then every seed below in order, all records
npm run seed:map     # read-only: rebuild the id map (data/master/id-map.<env>.json); creates nothing, workbook untouched
npm run seed:clear   # only remove the seed colors and statuses from the workbook
```

### Delete the seeded data

To run `seed:all` again on a filled environment, first delete what it created:

```bash
npm run seed:delete                                    # dry run: how many records of each reference would be deleted
npm run seed:delete -- --confirm                       # delete them
npm run seed:delete -- --confirm --only ports,terminals
```

It deletes every record that matches a workbook row, found the same way as the seeds find them (it runs `seed:map` first), including records that were created by hand before the first seed. Other records are not touched. Children go first (terminals, vessels, accounts, ... then projects, ports, clients, products, characteristics); subprojects are deleted with their projects. Banks are not deleted: the API and the UI cannot delete banks. Ask the team to delete them in the database, or `seed:all` finds them as "exists". A record that cannot be deleted, e.g. because a deal uses it, is printed as `ERROR` and the run goes on. The workbook is not changed. It runs only on uat.

`seed:all` and `seed:map` run all seeds in one process and print the time of each seed at the end. Creates and geo lookups go 5 at a time; set `SEED_CONCURRENCY` in `.env` to change it (`SEED_CONCURRENCY=1` sends everything one by one, as before). Rows that share a unique value (the same name, escalation name or counterparty abbreviation) are still sent one after another in workbook order.

### One reference at a time

Without `--limit`, most seeds process **only the first record** (check mode). Add `-- --limit 1000` to process all records:

| Command | Tab | Default |
|---|---|---|
| `npm run seed:characteristics` | 7. Characteristics | all |
| `npm run seed:products` | 8. Products & Subproducts | all |
| `npm run seed:subproducts -- --limit 1000` | 9. Product Characteristics | first only |
| `npm run seed:escalations -- --limit 1000` | 10. Escalations | first only |
| `npm run seed:shippers` | 5. Shippers | all |
| `npm run seed:banks -- --limit 1000` | 2. Banks | first only |
| `npm run seed:legal-forms -- --limit 1000` | 1. Counterparties (legal forms) | first only |
| `npm run seed:clients -- --limit 1000` | 1. Counterparties | first only |
| `npm run seed:client-accounts -- --limit 1000` | 3. Bank Accounts | first only |
| `npm run seed:vessels -- --limit 1000` | 4. Tankers - Vessels | first only |
| `npm run seed:ports -- --limit 1000` | 12. Load & Unload Ports | first only |
| `npm run seed:terminals -- --limit 1000` | 15. Terminals | first only |
| `npm run seed:resources -- --limit 1000` | 13. Resources | first only |
| `npm run seed:projects -- --limit 1000` | 6. Projects & Subprojects (projects) | first only |
| `npm run seed:subprojects -- --limit 1000` | 6. Projects & Subprojects (subprojects) | first only |

**Check one record:**

```bash
npm run seed:banks -- --limit 1
```

### Order

When running seeds one by one, load the parents first (`seed:all` does this itself):

- characteristics → products → subproducts → escalations
- legal forms → counterparties → banks → bank accounts → vessels
- ports → terminals → resources
- projects → subprojects

### Good to know

- **Rerunning a seed is safe.** Existing records are not created again or updated; they are marked "exists". The rerun overwrites the workbook statuses, so "created" from the previous run is replaced by "exists".
- **Login.** Every command reuses the saved API session (`playwright/.auth/api-state.json`) and logs in only when it has expired. A login takes about 6 s. Several failed logins in a row lock the user (`errorCode 100009`), so do not retry a failing login in a loop.
- **Ids.** Ids are never typed by hand. The seeds find them in the system by natural key (name, SWIFT/BIC, IMO, UN/LOCODE, ...) on every run and save them to `data/master/id-map.<env>.json`.
