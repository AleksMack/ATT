import { main as characteristics } from '../seed-characteristics';
import { main as products } from '../seed-products';
import { main as subproducts } from '../seed-subproducts';
import { main as escalations } from '../seed-escalations';
import { main as shippers } from '../seed-shippers';
import { main as banks } from '../seed-banks';
import { main as legalForms } from '../seed-legal-forms';
import { main as clients } from '../seed-clients';
import { main as clientAccounts } from '../seed-client-accounts';
import { main as vessels } from '../seed-vessels';
import { main as ports } from '../seed-ports';
import { main as terminals } from '../seed-terminals';
import { main as resources } from '../seed-resources';
import { main as projects } from '../seed-projects';
import { main as subprojects } from '../seed-subprojects';

/** Every seed in dependency order, each with all its records. */
export const SEEDS: { name: string; run: () => Promise<void> }[] = [
  { name: 'characteristics', run: () => characteristics() },
  { name: 'products', run: () => products(Infinity) },
  { name: 'subproducts', run: () => subproducts(Infinity) },
  { name: 'escalations', run: () => escalations(Infinity) },
  { name: 'shippers', run: () => shippers(Infinity) },
  { name: 'banks', run: () => banks(Infinity) },
  { name: 'legal-forms', run: () => legalForms(Infinity) },
  { name: 'clients', run: () => clients(Infinity) },
  { name: 'client-accounts', run: () => clientAccounts(Infinity) },
  { name: 'vessels', run: () => vessels(Infinity) },
  { name: 'ports', run: () => ports(Infinity) },
  { name: 'terminals', run: () => terminals(Infinity) },
  { name: 'resources', run: () => resources(Infinity) },
  { name: 'projects', run: () => projects(Infinity) },
  { name: 'subprojects', run: () => subprojects(Infinity) },
];

/**
 * Runs the seeds one after another in this process and prints the time of each.
 * Stops at the first seed that fails, like the former `&&` chain of npm scripts.
 */
export async function runSeeds(): Promise<void> {
  const times: string[] = [];
  const started = Date.now();
  for (const seed of SEEDS) {
    console.log(`\n=== ${seed.name}`);
    const start = Date.now();
    try {
      await seed.run();
    } finally {
      times.push(`${seed.name.padEnd(16)} ${((Date.now() - start) / 1000).toFixed(1)} s`);
    }
  }
  console.log(`\n${times.join('\n')}\nTotal            ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
