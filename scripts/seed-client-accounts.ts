/**
 * Seeds bank accounts of counterparties from tab "3. Bank Accounts".
 *
 *   npm run seed:client-accounts                 first account only (current check mode)
 *   npm run seed:client-accounts -- --limit 101  all accounts
 *
 * Links (checked for every row; a row that cannot be linked is not created):
 *   clientId: Counterparty ID -> Name (ENG) in tab 1 -> legalName in clients/list -> id
 *   bankId:   Bank ID -> SWIFT/BIC in tab 2 -> swiftBic in banks/list -> id
 * Fields: accountNumber = Account No., iban = IBAN (null if "N/A"), currency = code of Currency in
 * user/dictionary, status = 0 for Active / 1 (frozen) for Blocked, accountType = 0,
 * clientIdentity = Counterparty ID, statusDate = STATUS_DATE (not in the workbook, same for all).
 *
 * Loads all accounts once and creates only the missing ones (same account number = exists,
 * not updated). Tab 3 is cleared and re-marked: Account ID and Account No. green / red, "Seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { BanksApi } from '../api/banks';
import { ApiClient } from '../api/client';
import {
  ClientAccountsApi,
  type ClientAccount,
  type ClientAccountEnsureResult,
  type CreateClientAccountRequest,
} from '../api/clientAccounts';
import { ClientsApi } from '../api/clients';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '3. Bank Accounts';
const JSON_FILE = 'data/master/client-accounts.json';
/** Not in the workbook: the same status date for every account. */
const STATUS_DATE = '2020-09-01';
const STATUSES: Record<string, number> = { Active: 0, Blocked: 1 };

export async function main(limit = limitArg(1)): Promise<void> {
  assertWorkbookWritable();
  const counterparties = new Map((await readSheet('1. Counterparties', 'Counterparty ID')).map((r) => [r['Counterparty ID'], r]));
  const banksInBook = new Map((await readSheet('2. Banks', 'Bank ID')).map((r) => [r['Bank ID'], r]));
  const rows = await readSheet(SHEET, 'Account ID');
  const items = rows.map((row) => ({
    key: row['Account ID'],
    counterpartyId: row['Counterparty ID'],
    bankId: row['Bank ID'],
    accountNumber: row['Account No.'],
    iban: row['IBAN'] === 'N/A' || !row['IBAN'] ? null : row['IBAN'],
    currency: row['Currency'],
    status: row['Status'],
  }));
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limit);

  await ensureApiSession();
  const api = await ApiClient.create();
  const results: { key: string; result: ClientAccountEnsureResult }[] = [];
  try {
    const [dictionary, clients, banks] = await Promise.all([
      api.getData<{ currencies: { id: number; name: string }[] }>('user/dictionary'),
      new ClientsApi(api).listAll(),
      new BanksApi(api).listAll(),
    ]);
    const currencies = new Map(dictionary.currencies.map((c) => [c.name, c.id]));
    const clientIds = new Map(clients.map((c) => [c.legalName, c.id]));
    const bankIds = new Map(banks.map((b) => [b.swiftBic, b.id]));

    const requests: { key: string; request: CreateClientAccountRequest }[] = [];
    for (const item of selected) {
      const counterparty = counterparties.get(item.counterpartyId);
      const bank = banksInBook.get(item.bankId);
      const clientId = counterparty && clientIds.get(counterparty['Name (ENG)']);
      const bankId = bank && bankIds.get(bank['SWIFT/BIC']);
      const request: CreateClientAccountRequest = {
        accountType: 0,
        iban: item.iban,
        currency: currencies.get(item.currency) ?? 0,
        accountNumber: item.accountNumber,
        bankId: bankId ?? 0,
        clientIdentity: item.counterpartyId,
        statusDate: STATUS_DATE,
        status: STATUSES[item.status] ?? -1,
        clientId: clientId ?? 0,
      };
      const error = !counterparty
        ? `${item.counterpartyId} is not in tab 1`
        : clientId === undefined
          ? `client ${item.counterpartyId} "${counterparty['Name (ENG)']}" is not in the system`
          : !bank
            ? `${item.bankId} is not in tab 2`
            : bankId === undefined
              ? `bank ${item.bankId} (SWIFT ${bank['SWIFT/BIC']}) is not in the system`
              : !currencies.has(item.currency)
                ? `currency "${item.currency}" is not in the dictionary`
                : !(item.status in STATUSES)
                  ? `status "${item.status}" is not Active or Blocked`
                  : undefined;
      if (error) {
        results.push({ key: item.key, result: { request, status: 'error', error } });
        continue;
      }
      requests.push({ key: item.key, request });
    }
    const ensured = await new ClientAccountsApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook write fails
  printResults(results, (a: ClientAccount) => ({
    clientId: a.clientId,
    bankId: a.bankId,
    accountNumber: a.accountNumber,
    iban: a.iban,
    currency: a.currency,
    status: a.status,
  }));
  console.log(`Accounts processed: ${results.length} of ${items.length}.`);

  updateIdMap('clientAccounts', idsOf(results));

  await markRows(SHEET, 'Account ID', toStatuses(results), {
    colorHeaders: ['Account ID', 'Account No.'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

// Run directly (npm run seed:...), not when imported by seed-all or seed-map
if (require.main === module) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
