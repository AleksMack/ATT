/**
 * Seeds top-level products from tab "8. Products & Subproducts" through the API.
 *
 *   npm run seed:products              all products
 *   npm run seed:products -- --limit 1 first product only
 *
 * One product per distinct Product ID (the tab repeats it for every subproduct):
 *   name = Product Name, abbreviation = Product ID, comment = Description,
 *   characteristics = the distinct Characteristic IDs of the product's rows, each linked to
 *   the system via tab 7 (see characteristicLinks.ts).
 * A product whose characteristic is not in the system is not created.
 *
 * Loads the product list once and creates only the missing products (same name = exists,
 * not updated). Tab 8 is cleared and re-marked: product columns green / red, "Product seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { apiLogin } from '../api/auth';
import { ApiClient } from '../api/client';
import { ProductsApi, type CreateProductRequest, type Product, type ProductEnsureResult } from '../api/products';
import { loadCharacteristicLinks } from './master-data/characteristicLinks';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '8. Products & Subproducts';
const JSON_FILE = 'data/master/products.json';

async function main(): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Product ID');

  const items: { key: string; name: string; comment: string; characteristicIds: string[]; characteristicNames: string[] }[] = [];
  for (const row of rows) {
    let item = items.find((i) => i.key === row['Product ID']);
    if (!item) {
      item = { key: row['Product ID'], name: row['Product Name'], comment: row['Description'], characteristicIds: [], characteristicNames: [] };
      items.push(item);
    }
    const id = row['Characteristic ID'];
    if (id && !item.characteristicIds.includes(id)) {
      item.characteristicIds.push(id);
      item.characteristicNames.push(row['Characteristic Name']);
    }
  }
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limitArg(items.length));

  await apiLogin();
  const api = await ApiClient.create();
  const results: { key: string; result: ProductEnsureResult }[] = [];
  try {
    const link = await loadCharacteristicLinks(api);
    const requests: { key: string; request: CreateProductRequest }[] = [];
    for (const item of selected) {
      const request: CreateProductRequest = { name: item.name, abbreviation: item.key, comment: item.comment, characteristics: [] };
      const links = item.characteristicIds.map((id, i) => link(id, item.characteristicNames[i]));
      const failed = links.find((l) => !l.ok);
      if (failed && !failed.ok) {
        results.push({ key: item.key, result: { request, status: 'error', error: failed.error } });
        continue;
      }
      request.characteristics = links.flatMap((l) => (l.ok ? [l.ref] : []));
      requests.push({ key: item.key, request });
    }
    const ensured = await new ProductsApi(api).ensureAll(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook is open in Excel
  printResults(results, (p: Product) => ({
    name: p.name,
    abbreviation: p.abbreviation,
    comment: p.comment,
    characteristics: p.characteristics.map((c) => ({ id: c.id, name: c.name })),
  }));
  console.log(`Products processed: ${results.length} of ${items.length}.`);

  updateIdMap('products', idsOf(results));

  await markRows(SHEET, 'Product ID', toStatuses(results), {
    statusHeader: 'Product seed status',
    colorHeaders: ['Product ID', 'Product Name'],
  });
  console.log(`Workbook tab "${SHEET}" updated.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
