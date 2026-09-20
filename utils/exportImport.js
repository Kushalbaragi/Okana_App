import { isValid, parseISO } from 'date-fns';
import { toDateStr } from './format';

const TX_SHEET = 'Transactions';
const GOALS_SHEET = 'Savings Goals';
const ENTRIES_SHEET = 'Savings';
const TX_HEADERS = ['Date', 'Type', 'Amount', 'Description'];
const GOAL_HEADERS = ['Goal', 'Target', 'Status'];
const ENTRY_HEADERS = ['Goal', 'Date', 'Type', 'Amount', 'Note'];

// The savings sheets' own limits, the same the app's sheets and the table hold.
const MAX_GOAL_NAME = 60;
const MAX_ENTRY_NOTE = 80;

// Limits on what a spreadsheet can bring in. A row over one of them is skipped
// like any other bad row, except the row count, which stops the import outright:
// a file that big is read fully into memory and sent in one go, and it is far more
// likely to be the wrong file than a real ledger. The amount cap is the keypad's own.
const MAX_IMPORT_ROWS = 10000;
const MAX_IMPORT_AMOUNT = 99999999.99;
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

// Styles the header row of a sheet: bold on a light shade. SheetJS Community
// Edition supports basic cell styles on write as long as `cellStyles: true` is
// passed to XLSX.write.
function addSheet(XLSX, wb, name, headers, rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = widths.map(wch => ({ wch }));
  headers.forEach((_, i) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E5E7EB' } } };
  });
  XLSX.utils.book_append_sheet(wb, ws, name);
}

// One workbook, three sheets: the transactions, the savings goals, and the money
// moved in and out of them. Transactions and entries run oldest first — reads
// like a ledger from account start through today rather than most-recent-first,
// which is how the app itself displays things. `goals` are the savings goals with
// their `entries` attached (what useSavings calls allGoals). An entry names its
// goal in a column rather than sitting under it, so a sheet can be filtered or
// pivoted as it is.
export function buildWorkbook({ transactions = [], goals = [] } = {}) {
  // Required lazily, not at module scope — xlsx is a sizeable, rarely-used
  // library (only these two Export/Import buttons in Settings touch it), so
  // its parse cost shouldn't be paid at app startup for every user.
  const XLSX = require('xlsx');
  const byDate = (a, b) => a.date.localeCompare(b.date);

  const txRows = [...transactions].sort(byDate).map(tx => [
    tx.date,
    tx.type === 'income' ? 'Income' : 'Expense',
    tx.amount,
    tx.description || '',
  ]);
  const goalRows = goals.map(g => [g.name, g.target, g.completedAt ? 'Completed' : 'Active']);
  const entryRows = goals.flatMap(g =>
    [...g.entries].sort(byDate).map(e => [g.name, e.date, e.type === 'add' ? 'Add' : 'Withdraw', e.amount, e.note || ''])
  );

  const wb = XLSX.utils.book_new();
  addSheet(XLSX, wb, TX_SHEET, TX_HEADERS, txRows, [12, 10, 12, 36]);
  addSheet(XLSX, wb, GOALS_SHEET, GOAL_HEADERS, goalRows, [28, 12, 12]);
  addSheet(XLSX, wb, ENTRIES_SHEET, ENTRY_HEADERS, entryRows, [28, 12, 10, 12, 30]);
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx', cellStyles: true });
}

function normalizeType(raw) {
  const v = (raw ?? '').toString().trim().toLowerCase();
  if (v === 'income' || v === 'in' || v === 'credit') return 'income';
  if (v === 'expense' || v === 'exp' || v === 'out' || v === 'debit') return 'expense';
  return null;
}

function normalizeEntryType(raw) {
  const v = (raw ?? '').toString().trim().toLowerCase();
  if (v === 'add' || v === 'deposit' || v === 'in') return 'add';
  if (v === 'withdraw' || v === 'withdrawal' || v === 'out') return 'withdraw';
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

const isBlank = row => !row || row.every(cell => cell === '' || cell == null);

// A sheet's rows below its header, as arrays. The header is the first row when
// its first cell says what it should; a sheet without one is read from row 0.
function sheetRows(XLSX, ws, headerPattern) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rest = rows[0] && headerPattern.test(String(rows[0][0])) ? rows.slice(1) : rows;
  if (rest.length > MAX_IMPORT_ROWS) {
    throw new Error(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString('en-IN')} rows — split it into smaller files and import them one at a time.`);
  }
  return rest.filter(row => !isBlank(row));
}

// Expects the Date/Type/Amount/Description column order this app exports — but
// tolerant of real-world variations (Excel auto-converting the date column,
// "Credit"/"Debit" instead of "Income"/"Expense", a currency-symbol amount).
function parseTransactionRows(rows) {
  const parsed = [];
  const skipped = [];
  for (const row of rows) {
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

const goalKey = name => name.toLowerCase();

// Goals are Goal/Target/Status; entries are Goal/Date/Type/Amount/Note, each
// naming its goal. An entry whose goal isn't in the goals sheet is still kept —
// the import matches it to a goal the account already has, and drops it if there
// is none, since a goal needs a target. A goal named twice keeps its first row.
// Within a goal, entries are checked in date order (deposits before withdrawals on
// the same day) and a withdrawal that would take it below zero is skipped, the
// same rule the app applies to a single one.
function parseSavingsRows(goalRows, entryRows) {
  const goals = [];
  const entries = [];
  const skipped = [];
  const seen = new Set();

  for (const row of goalRows) {
    const [rawName, rawTarget, rawStatus] = row;
    const name = (rawName ?? '').toString().trim();
    const target = normalizeAmount(rawTarget);
    if (!name || name.length > MAX_GOAL_NAME || !Number.isFinite(target) || target <= 0 || target > MAX_IMPORT_AMOUNT || seen.has(goalKey(name))) {
      skipped.push(row);
      continue;
    }
    seen.add(goalKey(name));
    goals.push({ name, target, completed: /^(completed|done|yes)$/i.test((rawStatus ?? '').toString().trim()) });
  }

  const valid = [];
  for (const row of entryRows) {
    const [rawName, rawDate, rawType, rawAmount, rawNote] = row;
    const goalName = (rawName ?? '').toString().trim();
    const date = normalizeDate(rawDate);
    const type = normalizeEntryType(rawType);
    const amount = normalizeAmount(rawAmount);
    if (!goalName || !date || !type || !Number.isFinite(amount) || amount <= 0 || amount > MAX_IMPORT_AMOUNT) {
      skipped.push(row);
      continue;
    }
    valid.push({ row, goalName, type, amount, date, note: (rawNote ?? '').toString().trim().slice(0, MAX_ENTRY_NOTE) });
  }

  // Only goals of this file can be balanced here; an entry for a goal the account
  // already has starts from what it holds, which is never below zero, so a
  // sequence that stays non-negative from zero stays so on top of it.
  const balance = new Map();
  valid
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || (a.e.type === b.e.type ? a.i - b.i : a.e.type === 'add' ? -1 : 1))
    .forEach(({ e }) => {
      const key = goalKey(e.goalName);
      const held = balance.get(key) ?? 0;
      const next = held + (e.type === 'add' ? e.amount : -e.amount);
      if (next < -0.005) { skipped.push(e.row); return; }
      balance.set(key, next);
      entries.push({ goalName: e.goalName, type: e.type, amount: e.amount, date: e.date, note: e.note });
    });

  return { goals, entries, skipped };
}

const findSheet = (wb, name) => wb.SheetNames.find(n => n.trim().toLowerCase() === name.toLowerCase());

// Reads an .xlsx/.xls into { transactions, savings }, each with what was
// understood and the rows that weren't. The transactions are the sheet named
// Transactions, or else the first sheet — so a plain one-sheet ledger from
// elsewhere still imports. Savings come from the two savings sheets, which a
// file may simply not have. Invalid rows are skipped rather than aborting the
// whole import, since one bad row shouldn't block the rest.
export function parseWorkbook(base64) {
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

  const goalsName = findSheet(wb, GOALS_SHEET);
  const entriesName = findSheet(wb, ENTRIES_SHEET);
  const txName = findSheet(wb, TX_SHEET)
    ?? wb.SheetNames.find(n => n !== goalsName && n !== entriesName);

  const read = (name, pattern) => name ? sheetRows(XLSX, wb.Sheets[name], pattern) : [];
  return {
    transactions: parseTransactionRows(read(txName, /date/i)),
    savings: parseSavingsRows(read(goalsName, /goal|name/i), read(entriesName, /goal|name/i)),
  };
}
