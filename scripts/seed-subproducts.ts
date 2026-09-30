/**
 * Seeds subproducts from tab "9. Product Characteristics" through the API.
 *
 *   npm run seed:subproducts               first subproduct only (current check mode)
 *   npm run seed:subproducts -- --limit 23
 *
 * One subproduct per distinct Subproduct ID (the tab has one row per characteristic):
 *   name = Subproduct, abbreviation = Subproduct ID, subproductType = 0,
 *   parentId = id of the product in the system whose abbreviation is the Product ID,
 *   characteristics = all distinct characteristics of the subproduct's rows, linked via tab 7.
 * A subproduct whose parent or any of its characteristics is not in the system is not created.
 *
 * Loads the subproduct list once and creates only the missing ones (same parent + name =
 * exists, not updated). Tab 9 is cleared and re-marked: subproduct columns green / red,
 * "Subproduct seed status".
 */
import 'dotenv/config';
import { updateIdMap } from '../utils/idMap';
import fs from 'fs';
import { ensureApiSession } from '../api/auth';
import { ApiClient } from '../api/client';
import { ProductsApi, type CreateProductRequest, type Product, type ProductEnsureResult } from '../api/products';
import { loadCharacteristicLinks } from './master-data/characteristicLinks';
import { idsOf, limitArg, printResults, toStatuses } from './master-data/report';
import { assertWorkbookWritable, markRows, readSheet } from './master-data/workbook';

const SHEET = '9. Product Characteristics';
const JSON_FILE = 'data/master/subproducts.json';
/** Existing subproducts use 0 and 2; the meaning is not documented in Swagger. */
const SUBPRODUCT_TYPE = 0;

export async function main(limit = limitArg(1)): Promise<void> {
  assertWorkbookWritable();
  const rows = await readSheet(SHEET, 'Product Characteristic ID');

  const items: { key: string; name: string; productId: string; characteristics: { id: string; name: string }[] }[] = [];
  for (const row of rows) {
    let item = items.find((i) => i.key === row['Subproduct ID']);
    if (!item) {
      item = { key: row['Subproduct ID'], name: row['Subproduct'], productId: row['Product ID'], characteristics: [] };
      items.push(item);
    }
    if (!item.characteristics.some((c) => c.id === row['Characteristic ID'])) {
      item.characteristics.push({ id: row['Characteristic ID'], name: row['Characteristic Name'] });
    }
  }
  fs.writeFileSync(JSON_FILE, `${JSON.stringify(items, null, 2)}\n`);
  const selected = items.slice(0, limit);

  await ensureApiSession();
  const api = await ApiClient.create();
  const products = new ProductsApi(api);
  const results: { key: string; result: ProductEnsureResult }[] = [];
  try {
    const link = await loadCharacteristicLinks(api);
    const parents = new Map((await products.listAll()).map((p) => [p.abbreviation, p.id]));

    const requests: { key: string; request: CreateProductRequest }[] = [];
    for (const item of selected) {
      const request: CreateProductRequest = {
        name: item.name,
        abbreviation: item.key,
        characteristics: [],
        subproductType: SUBPRODUCT_TYPE,
        parentId: parents.get(item.productId),
      };
      const links = item.characteristics.map((c) => link(c.id, c.name));
      const failed = links.find((l) => !l.ok);
      const error =
        request.parentId === undefined
          ? `parent product ${item.productId} is not in the system`
          : failed && !failed.ok
            ? failed.error
            : undefined;
      if (error) {
        results.push({ key: item.key, result: { request, status: 'error', error } });
        continue;
      }
      request.characteristics = links.flatMap((l) => (l.ok ? [l.ref] : []));
      requests.push({ key: item.key, request });
    }
    const ensured = await products.ensureAllSubproducts(requests.map((r) => r.request));
    ensured.forEach((result, i) => results.push({ key: requests[i].key, result }));
  } finally {
    await api.dispose();
  }

  // Print first, so the result is shown even if the workbook is open in Excel
  printResults(results, (p: Product) => ({
    name: p.name,
    abbreviation: p.abbreviation,
    parentId: p.parentId,
    subproductType: p.subproductType,
    characteristics: p.characteristics.map((c) => ({ id: c.id, name: c.name })),
  }));
  console.log(`Subproducts processed: ${results.length} of ${items.length}.`);

  updateIdMap('subproducts', idsOf(results));

  await markRows(SHEET, 'Product Characteristic ID', toStatuses(results), {
    keyHeader: 'Subproduct ID',
    statusHeader: 'Subproduct seed status',
    colorHeaders: ['Subproduct ID', 'Subproduct'],
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
