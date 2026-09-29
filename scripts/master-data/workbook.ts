import ExcelJS from 'exceljs';

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

/**
 * Colors data rows green (ok) or red (not ok) and writes the status text into the
 * "Seed status" column, added after the last header if missing. Rows are matched by
 * the value of the first column (the workbook ID, e.g. CH-001).
 */
export async function markRows(sheetName: string, firstHeader: string, statuses: Map<string, RowStatus>): Promise<void> {
  const workbook = await load();
  const { sheet, headerRow, headers } = locate(workbook, sheetName, firstHeader);

  let statusColumn = headers.indexOf(STATUS_HEADER) + 1;
  if (!statusColumn) {
    statusColumn = headers.length + 1;
    const header = sheet.getRow(headerRow).getCell(statusColumn);
    header.value = STATUS_HEADER;
    header.style = { ...sheet.getRow(headerRow).getCell(1).style };
    sheet.getColumn(statusColumn).width = 45;
  }

  sheet.eachRow((row, rowNumber) => {
    const status = statuses.get(row.getCell(1).text.trim());
    if (rowNumber <= headerRow || !status) return;
    row.getCell(statusColumn).value = status.text;
    for (let column = 1; column <= statusColumn; column++) {
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
