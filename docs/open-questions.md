# Open questions

The single list of open questions for the CTRM test automation project. New questions are added here, not in other documents.

Updated: 2026-09-29. Environment: uat (`https://uat.ctrm.biz`).

**Legend:**
- **Owner:** who is expected to answer (BA, Dev, QA lead / team).
- **Blocks:** what cannot be done, or is done with a workaround, until the question is answered.

## Master data (workbook `CRM_Master_Data_Request_TESTDATA_v3.xlsx`)

| # | Question | Owner | Blocks |
|---|---|---|---|
| Q-01 | **Duplicate counterparty abbreviation.** CP-014 "Santos Energia" and CP-023 "Samarqand Energiya" both have the abbreviation `SE` in tab 1. The system requires unique abbreviations (`errorCode 16`). Which abbreviation should CP-023 get? | BA | CP-023 and everything linked to it are not created: bank accounts ACC-0047, ACC-0048, and vessel VSL-013 (CP-023 is its operator). |
| Q-02 | **Cities not in the system's geo list.** The seed uses the first city of the country when a city is not found, so these records have the wrong city: banks BNK-008, 010 and counterparties CP-011, 024 (Port Harcourt → "Aba"); BNK-012 and CP-035 (Zhoushan → "\`Aqqan"); BNK-016 and CP-023 (Samarkand → "Almalyk"); CP-029 (Andijan → "Almalyk"); CP-041 (Karshi → "Almalyk"). Should the workbook use a city that exists in the geo list, or should Dev add these cities? | BA, Dev | Correct addresses of 4 banks and 6 counterparties (CP-023 is not created yet, see Q-01). |
| Q-03 | **City spelled differently.** "Ras Al Khaimah" (BNK-002, 005, CP-018, 030) is in the geo list as "Ras al-Khaimah", but the search does not find it, so these records got "Abu Dhabi". Similar, taken as the closest match: Sharjah → "Sharjah city", Navoi → "Navoiy City", Fergana → "Fergana City", Xiamen → "Xiamen City". Should the workbook use the system spelling? (Alternatively the seed can match city names ignoring case and hyphens; see Q-10.) | BA | Correct city for 4 records ("Abu Dhabi" instead of Ras Al Khaimah). |
| Q-04 | **Sanctioned vessel.** VSL-026 "Bohai Pearl" is "Sanctioned" in tab 4, but the seed does not send `sanctionStatus` (the example request did not have it). Should it be set? The strategy uses this vessel for the negative test "a sanctioned vessel cannot be used in a bill of lading". | BA | The sanctioned-vessel negative test (strategy, section 7). |
| Q-05 | **Blocked bank accounts.** The 8 accounts with Status "Blocked" in tab 3 are created with status 1 ("Заморожен", frozen). The system also has 2 ("Закрыт", closed). Is frozen correct? | BA | The blocked-account negative test (strategy, section 7). |
| Q-06 | **Account status date.** Tab 3 has no status date; all accounts get 2020-09-01. Is one date for all acceptable? | BA | Nothing (workaround in place). |
| Q-07 | **Users.** Tab 17 (Users) is empty, but Project Links reference `USR-xxx` and Projects have an empty Lead column. Which users and roles exist on the test environment? | BA, QA lead | Tab 11 (Project & Subproject Links); project leads. |
| Q-08 | **Platts quotations.** The symbols in tab 16 are marked "from memory, verify". Are quotations needed for the first flow? | BA | Tab 16; pricing checks. |
| Q-09 | **Vessel type.** "Type / Vessel Type" is not sent, as agreed. Is it needed later, and what is the mapping of the workbook types to the system's `vesselType` values? | BA | Nothing now. |
| Q-26 | **Escalation names must be unique.** The system rejects an escalation whose name already exists, even for another characteristic (`errorCode 2`). Tab 10 reuses names for different subproducts and characteristics, so 14 rows are not created: ESC-013, 014, 015, 021, 026, 028, 031, 032, 036, 040, 041, 043, 044, 050 ("Sulphur penalty", "Sulphur rejection", "Sulphur de-escalation", "Sulphur premium", "Octane penalty", "Density de-escalation", "Flash point rejection"). How should they be renamed (for example, with the subproduct: "Sulphur penalty – Gasoil 50 ppm")? ESC-043 and ESC-044 are identical (same name, characteristic and spec): is one of them a duplicate? | BA | 14 escalations. |
| Q-27 | **Escalation values.** "Value / Threshold" (e.g. "USD 0.05/bbl per 1.0 kg/m³ above 858") is not sent; the API has defaultValue, defaultRangeStart / Finish and defaultStep. Should these be filled, and how does the text map to them? | BA | Escalation amounts in price calculations. |
| Q-28 | **Ports not in the geo list.** 13 ports get the first city of their country because the port name is not a city in the system: Jebel Ali, Ruwais, Hamriyah, Das Island, Jebel Dhanna (UAE → "Abu Dhabi"), Port Harcourt, Onne, Escravos, Forcados (Nigeria → "Aba"), Zhoushan, Qinzhou (China → "\`Aqqan"), Suape (Brazil → "Abadiânia"), Sarroch (Italy → "Abano Terme"); "Rio Grande" gets the closest match "Rio Grande da Serra", which is another city. Should tab 12 get a City column, or should Dev add these cities? | BA, Dev | Correct city of 14 ports. |
| Q-29 | **Inactive ports.** 2 ports in tab 12 have Status "Inactive". They are created like active ones (no sanction status). How should "Inactive" be set in the system? The strategy uses inactive ports for a negative test. | BA | The inactive-port negative test (strategy, section 7). |
| Q-30 | **Fujairah without sanction status.** PRT-001 "Fujairah" (id 1) was created by hand without the sanction status, but tab 12 marks it "Restricted". The seed does not update existing records. Should it be deleted and seeded again, or fixed in the UI? | QA lead | The restricted-port negative test. |
| Q-31 | **Resource city.** Tab 13 has no city column; the seed uses the city of the resource's port (so resources at ports from Q-28 get the same wrong city, e.g. Ruwais → "Abu Dhabi"). The example request used "Al Ruways Industrial City" for Ruwais Refinery West, which a search for "Ruwais" does not find. Should tab 13 get a City column? | BA | Correct city of resources. |
| Q-32 | **Resource fields not sent.** Resource Type, Terminal, Status (3 Inactive, 2 Under Review) and Notes are not sent: the create request has no type or terminal, and the example request had no notes. Where are the resource type and the resource-terminal link set? Should Notes go to `notes`? | BA, Dev | Terminals (tab 15) and resource types. |
| Q-34 | **HTTP 500 on parallel requests.** With 5 parallel deletes uat answers some with HTTP 500 `errorCode 1` ("Общая техническая ошибка"); some of them are deleted anyway, others pass when sent again one by one. Is this a known server issue (locking, transactions)? Creates in `seed:all` also run in parallel and may hit the same error. | Dev | Safe concurrency for seeds (`SEED_CONCURRENCY`). |

## API and system behaviour

| # | Question | Owner | Blocks |
|---|---|---|---|
| Q-10 | **Case-sensitive matching.** Reference data is matched by exact name (for example, "Gasoil" in the workbook is not "GasOil" in the system, and would be created again). Should names be matched ignoring case (and hyphens for cities)? | QA lead | Possible near-duplicates in shared environments. |
| Q-11 | **Fields sent but not in Swagger.** Counterparty create is sent with `legalFormAbbreviationRUS` and `role`, as the UI does, but `CreateUpdateCounterpartyRequest` in Swagger does not list them. Are they used by the server? | Dev | Nothing (the server accepts them). |
| Q-12 | **`subproductType`.** Swagger gives no meaning for the values; existing subproducts use 0 and 2, the seed uses 0. What do the values mean? | Dev | Nothing now. |
| Q-13 | **Validation limits not in Swagger.** Characteristic names are limited to 20 characters; a product needs at least one characteristic. Are there similar limits for other resources, and can they be documented in Swagger? | Dev | Unexpected seed errors for new tabs. |
| Q-14 | **Other master data tabs.** Does the API support create and search for every master data tab? Which tabs are UI-only (for example, 14 Sample Documents)? | Dev | Tabs 10, 11, 13, 14, 15, 16. |
| Q-15 | **`data-testid`.** Can developers add `data-testid` or `aria-label` attributes to key elements (header icon buttons, form fields)? The app has none, so UI locators depend on visible texts in Russian. | Dev | Stability of UI tests. |

## Business rules (needed for the end-to-end flow)

| # | Question | Owner | Blocks |
|---|---|---|---|
| Q-16 | **Rounding and precision** for money, volume (bbl / MT / m3) and unit cost. | BA | All calculation checks (`utils/economics.ts`). |
| Q-17 | **Exchange rate source** for amounts in another currency: system or market rates, and on which date? | BA | Invoice USD amount check (PoC candidate A). |
| Q-18 | **"Other costs" in batch cost:** which cost types are included? | BA | Flow step 4 (warehouse cost). |
| Q-19 | **Invoice status after payment:** rules for full, partial and overpayment. | BA | Flow step 7. |
| Q-20 | **Bank statement:** imported (which file format?) or created manually? | BA | Flow step 8. |
| Q-21 | **Deleting test data:** which documents can be deleted after a run? | BA, Dev | Cleanup of flow data (strategy, 5.5). |

## Test environment and access

| # | Question | Owner | Blocks |
|---|---|---|---|
| Q-22 | **Test user.** The tests log in as a personal account. Can the team create a dedicated test user, so the records created by tests are not attributed to a person? Its password was shared in a chat and should be changed. | QA lead | Nothing technically; security and audit. |
| Q-23 | **Rights of the test user.** Are its rights enough to create and delete all documents of the flow (contracts, deals, invoices, payments)? Does any step need a second user for approval? | QA lead, BA | Flow steps 6-8. |
| Q-24 | **Shared environment.** Do other people work on uat? If yes, tests keep to `AUTO_` names for flow data and never change other records. | QA lead | Test data isolation. |
| Q-25 | **Login report leak.** The HTML report of the UI login (`setup`) shows the password and OTP in step titles (`Fill "<value>"`). Should UI login be replaced by API login for the session, with a separate UI login test that hides the values? | QA lead | Sharing HTML reports, CI. |

## Resolved

| # | Question | Answer |
|---|---|---|
| R-01 | Where is the Swagger / OpenAPI spec? | `https://uat-api.ctrm.biz/swagger/v1/swagger.json` (the same on qa01), saved as `docs/openapi.json`. |
| R-02 | Characteristic names longer than 20 characters are rejected. | BA shortened the 10 names in tab 7 (marked in blue font); tab 9 links by Characteristic ID. |
| R-03 | A product needs at least one characteristic, but tab 9 had none for PRD-09 to PRD-14. | Every product has CH-000 "Density" in tab 8. |
| R-04 | Which characteristics does a subproduct get? | All characteristics of its rows in tab 9. |
| R-05 | Project start date when the subprojects have different dates. | The earliest Start Date among the project's rows. |
| R-06 | Are the workbook data (including IBANs) real? | All data is fictional; the workbook is kept in the repository. |
| R-07 | Currencies and countries: predefined or seeded? | Predefined in the system (`user/dictionary` currencies, geo lists), not seeded. |
| R-08 | Can the seeded banks be deleted? `banks/delete` answers `errorCode 70` ("used by another record") even with no counterparties or accounts left. | Banks cannot be deleted through the API or the UI. The team deletes them directly in the database when needed (done on uat on 2026-09-30); `seed:delete` skips banks. |
