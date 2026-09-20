import { isValid, parseISO } from 'date-fns';
import { toDateStr } from './format';

const HEADERS = ['Date', 'Type', 'Amount', 'Description'];

// Limits on what a spreadsheet can bring in. A row over one of them is skipped
// like any other bad row, except the row count, which stops the import outright:
// a file that big is read fully into memory and sent in one go, and it is far more
// likely to be the wrong file than a real ledger. The amount cap is the keypad's own.
const MAX_IMPORT_ROWS = 10000;
const MAX_IMPORT_AMOUNT = 99999999.99;
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

// One workbook, one sheet, oldest transaction first — reads like a ledger
// from account start through today rather than most-recent-first, which is
// how the app itself displays things.
export function buildTransactionsWorkbook(transactions) {
  // Required lazily, not at module scope — xlsx is a sizeable, rarely-used
  // library (only these two Export/Import buttons in Settings touch it), so
  // its parse cost shouldn't be paid at app startup for every user.
  const XLSX = require('xlsx');
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const rows = sorted.map(tx => [
    tx.date,
    tx.type === 'income' ? 'Income' : 'Expense',
    tx.amount,
    tx.description || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 36 }];

  // Bold, shaded header row — SheetJS Community Edition supports basic cell
  // styles on write as long as `cellStyles: true` is passed to XLSX.write.
  HEADERS.forEach((_, i) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[ref]) {
      ws[ref].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'E5E7EB' } },
      };
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx', cellStyles: true });
}

function normalizeType(raw) {
  const v = (raw ?? '').toString().trim().toLowerCase();
  if (v === 'income' || v === 'in' || v === 'credit') return 'income';
  if (v === 'expense' || v === 'exp' || v === 'out' || v === 'debit') return 'expense';
  return null;
}

// Accepts either a real Date (from a genuinely date-formatted Excel cell —
// see cellDates:true below) or plain text someone typed into the column.
// Only a real calendar date within a sane range gets through: a string that just
// looks like one (2024-13-45) would make the database reject the whole chunk of
// rows it was sent in, so one typo would fail the import.
function normalizeDate(raw) {
  if (raw == null || raw === '') return null;
  let d;
  if (raw instanceof Date) {
    d = raw;
  } else {
    const str = raw.toString().trim();
    d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? parseISO(str) : new Date(str);
  }
  if (!isValid(d)) return null;
  const year = d.getFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  return toDateStr(d);
}

// Whole cents, so a value like 0.1 + 0.2 in the sheet doesn't arrive as
// 0.30000000000000004.
function normalizeAmount(raw) {
  const n = typeof raw === 'number' ? raw : parseFloat((raw ?? '').toString().replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

// Reads the first sheet of any .xlsx/.xls, expecting the same
// Date/Type/Amount/Description column order this app exports — but
// tolerant of real-world variations (Excel auto-converting the date column,
// "Credit"/"Debit" instead of "Income"/"Expense", a currency-symbol amount).
// Returns { parsed, skipped } — invalid rows are skipped rather than
// aborting the whole import, since one bad row shouldn't block the rest.
export function parseTransactionsWorkbook(base64) {
  const XLSX = require('xlsx');
  let wb;
  try {
    wb = XLSX.read(base64, { type: 'base64', cellDates: true });
  } catch {
    // Not a valid xlsx/xls at all (corrupted, wrong format, mislabeled
    // file) — XLSX.read throws its own internal parser error here, which
    // reads as gibberish to a user. A clear, actionable message instead.
    throw new Error("That file couldn't be read — make sure it's a valid Excel file (.xlsx).");
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { parsed: [], skipped: [] };

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // First non-empty row is assumed to be the header — skip it by looking
  // for the word "date" (case-insensitive) in the first cell, falling back
  // to just skipping row 0 if the sheet doesn't look like it has one.
  const looksLikeHeader = rows[0] && /date/i.test(String(rows[0][0]));
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString('en-IN')} rows — split it into smaller files and import them one at a time.`);
  }

  const parsed = [];
  const skipped = [];

  for (const row of dataRows) {
    if (!row || row.every(cell => cell === '' || cell == null)) continue; // blank row

    const [rawDate, rawType, rawAmount, rawDescription] = row;
    const date = normalizeDate(rawDate);
    const type = normalizeType(rawType);
    const amount = normalizeAmount(rawAmount);

    if (!date || !type || !Number.isFinite(amount) || amount <= 0 || amount > MAX_IMPORT_AMOUNT) {
      skipped.push(row);
      continue;
    }

    // Capped to match AddModal's own description field (140) — the
    // `transactions.description` column itself has no length constraint,
    // and a spreadsheet is the one path where an arbitrarily long value
    // could otherwise reach it directly, bypassing that client-side cap.
    parsed.push({
      date,
      type,
      amount,
      description: (rawDescription ?? '').toString().trim().slice(0, 140),
    });
  }

  return { parsed, skipped };
}
