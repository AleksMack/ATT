import type { ApiClient } from '../../api/client';
import { PhysicalCharacteristicsApi } from '../../api/physicalCharacteristics';
import type { ProductCharacteristicRef } from '../../api/products';
import { readSheet } from './workbook';

export type CharacteristicLink = { ok: true; ref: ProductCharacteristicRef } | { ok: false; error: string };

/**
 * Resolves a workbook Characteristic ID (CH-xxx) to the characteristic in the system:
 * CH-xxx -> name in tab "7. Characteristics" -> id in the API list (exact name).
 * Other tabs may hold an outdated name, so the tab 7 name wins; `fallbackName` is used
 * only if the ID is not in tab 7.
 */
export async function loadCharacteristicLinks(api: ApiClient): Promise<(id: string, fallbackName?: string) => CharacteristicLink> {
  const tab7 = new Map(
    (await readSheet('7. Characteristics', 'Characteristic ID')).map((row) => [row['Characteristic ID'], row['Characteristic Name']]),
  );
  const inSystem = new Map((await new PhysicalCharacteristicsApi(api).listAll()).map((c) => [c.name, c.id]));

  return (id, fallbackName) => {
    const name = tab7.get(id) ?? fallbackName;
    if (!name) return { ok: false, error: `characteristic ${id} is not in tab 7` };
    const systemId = inSystem.get(name);
    if (systemId === undefined) return { ok: false, error: `characteristic ${id} "${name}" is not in the system` };
    return { ok: true, ref: { id: systemId, name } };
  };
}
