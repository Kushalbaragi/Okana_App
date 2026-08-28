import { toDateStr } from './format';

const HEADERS = ['Date', 'Type', 'Amount', 'Description'];

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
function normalizeDate(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return toDateStr(raw);
  }
  const str = raw.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return toDateStr(d);
}

function normalizeAmount(raw) {
  if (typeof raw === 'number') return raw;
  const cleaned = (raw ?? '').toString().replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

// Reads the first sheet of any .xlsx/.xls, expecting the same
// Date/Type/Amount/Description column order this app exports — but
// tolerant of real-world variations (Excel auto-converting the date column,
// "Credit"/"Debit" instead of "Income"/"Expense", a currency-symbol amount).
// Returns { parsed, skipped } — invalid rows are skipped rather than
// aborting the whole import, since one bad row shouldn't block the rest.
export function parseTransactionsWorkbook(base64) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { parsed: [], skipped: [] };

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // First non-empty row is assumed to be the header — skip it by looking
  // for the word "date" (case-insensitive) in the first cell, falling back
  // to just skipping row 0 if the sheet doesn't look like it has one.
  const looksLikeHeader = rows[0] && /date/i.test(String(rows[0][0]));
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  const parsed = [];
  const skipped = [];

  for (const row of dataRows) {
    if (!row || row.every(cell => cell === '' || cell == null)) continue; // blank row

    const [rawDate, rawType, rawAmount, rawDescription] = row;
    const date = normalizeDate(rawDate);
    const type = normalizeType(rawType);
    const amount = normalizeAmount(rawAmount);

    if (!date || !type || !Number.isFinite(amount) || amount <= 0) {
      skipped.push(row);
      continue;
    }

    parsed.push({
      date,
      type,
      amount,
      description: (rawDescription ?? '').toString().trim(),
    });
  }

  return { parsed, skipped };
}
