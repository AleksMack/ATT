import ExcelJS from 'exceljs';
import fs from 'fs';

/** Master data workbook (see docs/test-strategy.md, 5.2). */
export const WORKBOOK_PATH = 'docs/CRM_Master_Data_Request_TESTDATA_v3.xlsx';

const STATUS_HEADER = 'Seed status';
const GREEN = 'FFC6EFCE';
const RED = 'FFFFC7CE';

export type Row = Record<string, string>;
export interface RowStatus {
  ok: boolean;
  text: string;
}

/** Reads a tab as rows keyed by header name. The header row is the one whose first cell is `firstHeader`. */
export async function readSheet(sheetName: string, firstHeader: string): Promise<Row[]> {
  const workbook = await load();
  const { sheet, headerRow, headers } = locate(workbook, sheetName, firstHeader);
  const rows: Row[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow || !row.getCell(1).text.trim()) return;
    rows.push(Object.fromEntries(headers.map((header, i) => [header, row.getCell(i + 1).text.trim()])));
  });
  return rows;
}

export interface MarkOptions {
  /** Header of the column whose value is the key in `statuses`. Default: the first column. */
  keyHeader?: string;
  /** Header of the status column, added after the last header if missing. Default: "Seed status". */
  statusHeader?: string;
  /** Headers of the columns to color. Default: all columns up to the status column. */
  colorHeaders?: string[];
}

/**
 * Colors data rows green (ok) or red (not ok) and writes the status text into the status
 * column. Rows are matched by the key column value (the workbook ID, e.g. CH-001); several
 * rows may share a key (e.g. a product repeated for each of its subproducts).
 * Rows not in `statuses` are cleared (no fill, empty status): the tab shows only this run.
 * Only fill and the status column change; values and fonts (e.g. blue edits) stay as they are.
 */
export async function markRows(
  sheetName: string,
  firstHeader: string,
  statuses: Map<string, RowStatus>,
  options: MarkOptions = {},
): Promise<void> {
  const workbook = await load();
  const { sheet, headerRow, headers } = locate(workbook, sheetName, firstHeader);
  const statusHeader = options.statusHeader ?? STATUS_HEADER;
  const keyColumn = options.keyHeader ? headers.indexOf(options.keyHeader) + 1 : 1;
  if (!keyColumn) throw new Error(`Column "${options.keyHeader}" not found in tab "${sheetName}"`);

  let statusColumn = headers.indexOf(statusHeader) + 1;
  if (!statusColumn) {
    statusColumn = headers.length + 1;
    const header = sheet.getRow(headerRow).getCell(statusColumn);
    header.value = statusHeader;
    header.style = { ...sheet.getRow(headerRow).getCell(1).style };
    sheet.getColumn(statusColumn).width = 45;
  }
  const colorColumns = options.colorHeaders
    ? [...options.colorHeaders.map((header) => headers.indexOf(header) + 1), statusColumn]
    : Array.from({ length: statusColumn }, (_, i) => i + 1);

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow || !row.getCell(keyColumn).text.trim()) return;
    const status = statuses.get(row.getCell(keyColumn).text.trim());

    // Clear the previous run first, so the colors show only this run
    if (!status) {
      row.getCell(statusColumn).value = null;
      for (const column of colorColumns) {
        const cell = row.getCell(column);
        cell.style = { ...cell.style, fill: { type: 'pattern', pattern: 'none' } };
      }
      return;
    }

    row.getCell(statusColumn).value = status.text;
    for (const column of colorColumns) {
      const cell = row.getCell(column);
      // New style object per cell: exceljs shares style objects between cells
      cell.style = {
        ...cell.style,
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: status.ok ? GREEN : RED } },
      };
    }
  });

  try {
    await workbook.xlsx.writeFile(WORKBOOK_PATH);
  } catch (error) {
    throw new Error(`Cannot write ${WORKBOOK_PATH} (is it open in Excel?): ${(error as Error).message}`);
  }
}

/**
 * Fails if the workbook cannot be written (usually: open in Excel). Seed scripts call it
 * before any API call, so a run never creates records it then cannot report in the workbook.
 */
export function assertWorkbookWritable(): void {
  try {
    fs.closeSync(fs.openSync(WORKBOOK_PATH, 'r+'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const hint = code === 'EBUSY' || code === 'EPERM' ? 'close it in Excel and run again' : (error as Error).message;
    throw new Error(`Workbook ${WORKBOOK_PATH} is not writable: ${hint}. Nothing was sent to the API.`);
  }
}

async function load(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  return workbook;
}

function locate(workbook: ExcelJS.Workbook, sheetName: string, firstHeader: string) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Tab "${sheetName}" not found in ${WORKBOOK_PATH}`);

  let headerRow = 0;
  sheet.eachRow((row, rowNumber) => {
    if (!headerRow && row.getCell(1).text.trim() === firstHeader) headerRow = rowNumber;
  });
  if (!headerRow) throw new Error(`Header "${firstHeader}" not found in tab "${sheetName}"`);

  const headers: string[] = [];
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, column) => {
    headers[column - 1] = cell.text.trim();
  });
  return { sheet, headerRow, headers };
}
