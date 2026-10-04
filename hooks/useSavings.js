import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { usePostHog } from 'posthog-react-native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNetwork } from '../context/NetworkContext'
import { isConnectivityError, reportError } from '../utils/errors'
import { storageKeys } from '../utils/storageKeys'
import { hapticAdded, hapticDeleted } from '../utils/haptics'
import { today } from '../utils/format'

function goalFromRow(row) {
  return {
    id:           row.id,
    name:         row.name,
    target:       parseFloat(row.target_amount),
    location:     row.location || '',
    kind:         row.kind || 'savings',
    // Debt only. Which shape this loan is: 'emi' (a fixed schedule — car,
    // bike, home, personal loan) or 'flexible' (no schedule — a friend,
    // family, informal borrowing). Null for a debt goal saved before this
    // split existed; `derived` below infers one for it (EMI-shaped data on
    // file means 'emi', otherwise 'flexible') rather than needing every old
    // goal migrated by hand. Always null for a savings goal.
    debtType:     row.debt_type ?? null,
    // EMI debt only: total number of EMIs the loan runs for — this is what
    // "Total repayment" (Monthly EMI × this) is worked out from in
    // `derived` below, not a snapshot of the loan's current state.
    tenureMonths: row.tenure_months ?? null,
    // EMI debt only. A plain count, typed in directly — not derived from a
    // date. Whether the loan is done, how many EMIs are left, and "left to
    // pay" all come straight from this (see `derived` below).
    emisPaidBefore: row.emis_paid || 0,
    // EMI debt only, optional. When the first EMI was/is due — used only to
    // put a real calendar date on "Next payment" (this plus `emisPaidBefore`
    // months forward) and "Estimated finish" (this plus the full tenure),
    // not to work out the count itself any more (see `derived`).
    firstEmiDate: row.first_emi_date ?? null,
    // EMI debt only. Shown as-is for reference; "Total repayment"/"left to
    // pay" both multiply this by an EMI count (see `derived`) rather than
    // this being read against a separately-tracked balance — there's no such
    // balance any more (see the removed `outstandingBalance`'s own history:
    // asking for a current balance directly, then estimating one from this,
    // both came and went before landing here — a loan's own schedule turned
    // out to be the one thing that needs no maintenance to stay right).
    emiAmount: row.emi_amount != null ? parseFloat(row.emi_amount) : null,
    completedAt:  row.completed_at,
    createdAt:    row.created_at,
  }
}

function entryFromRow(row) {
  return {
    id:            row.id,
    goalId:        row.goal_id,
    type:          row.type,
    amount:        parseFloat(row.amount),
    date:          row.date,
    note:          row.note,
    createdAt:     row.created_at,
    transactionId: row.transaction_id,
  }
}

const EMPTY = { goals: [], entries: [] }
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

const IMPORT_CHUNK_SIZE = 500

const cacheKey = storageKeys.savings

async function saveCache(userId, store) {
  // Best-effort: the list works without its cache, but a failing write is worth knowing about.
  try { await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(store)) } catch (err) { reportError(err) }
}

async function loadCache(userId) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    // An unreadable cache is treated as no cache, and reported.
    reportError(err)
    return null
  }
}

const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000))

// Newest first, the same ordering the transaction list uses.
function byDateDesc(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

// Savings goals and the money moved in and out of them.
//
// A goal's saved amount is always derived from its entries (adds minus
// withdrawals), never stored on the goal itself — so correcting or deleting a
// mistaken entry can't leave a stale total behind.
//
// Online-only, unlike transactions: writes need a connection and aren't queued.
// One made offline changes nothing and comes back as { success: false, offline:
// true } with no message, after asking the app for its offline banner (which
// also announces when the connection returns) — so the caller shows no error of
// its own on top of it. Reads still fall back to the cached copy, so the list is
// viewable offline.
// `onEntryLogged` (optional) mirrors useBudgetPlan's own `onChecked`: told
// once `logEntryAsExpense` below actually lands a row, so the caller's own
// transaction list (which has no way to know about a write here on its own)
// can refresh.
export function useSavings(onEntryLogged) {
  const { user } = useAuth()
  const { isOnlineRef, notifyOffline } = useNetwork()
  const posthog = usePostHog()
  const [store, setStore] = useState(EMPTY)
  const [loading, setLoading] = useState(true)

  // Read by the write helpers below so they can snapshot "what it was before"
  // for a rollback without depending on `store` (which would give every
  // callback a new identity on every change).
  const storeRef = useRef(store)
  useEffect(() => { storeRef.current = store }, [store])

  // Only persist once real data (cache or server) has been loaded — otherwise
  // the initial empty state would overwrite the cache before it is read.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (user && hydratedRef.current) saveCache(user.id, store)
  }, [store, user])

  // A refresh that lands while a write is in flight would replace the
  // optimistic state with a server snapshot that doesn't have that write yet,
  // making the change flicker away and back. Skip applying it in that case —
  // the write's own result is the newer truth.
  const writesInFlightRef = useRef(0)
  const refreshInFlightRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!user) { setStore(EMPTY); return }
    if (refreshInFlightRef.current) return refreshInFlightRef.current

    const run = (async () => {
      try {
        if (!isOnlineRef.current) return
        const [goalsRes, entriesRes] = await Promise.all([
          supabase.from('savings_goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
          supabase.from('savings_entries').select('*').eq('user_id', user.id),
        ])
        const failure = goalsRes.error || entriesRes.error
        if (failure) {
          // Keep showing what we have; being offline isn't worth a report, a rejection is.
          if (!isConnectivityError(failure, isOnlineRef.current)) reportError(failure)
          return
        }
        if (writesInFlightRef.current > 0) return
        hydratedRef.current = true
        setStore({
          goals: goalsRes.data.map(goalFromRow),
          entries: entriesRes.data.map(entryFromRow),
        })
      } catch (err) {
        // Keep showing cached data; a dropped connection is expected, anything else is reported.
        if (!isConnectivityError(err, isOnlineRef.current)) reportError(err)
      } finally {
        setLoading(false)
        refreshInFlightRef.current = null
      }
    })()

    refreshInFlightRef.current = run
    return run
  }, [user, isOnlineRef])

  useEffect(() => {
    if (!user) {
      hydratedRef.current = false
      setStore(EMPTY)
      return
    }
    let cancelled = false
    loadCache(user.id).then(cached => {
      if (cancelled || !cached) return
      hydratedRef.current = true
      setStore(cached)
    })
    refresh()
    return () => { cancelled = true }
  }, [user, refresh])

  // Runs one optimistic write. `apply` updates local state immediately,
  // `request` is the Supabase call, `rollback` undoes `apply` if it fails.
  // Every write in this hook goes through here so the offline check, the
  // in-flight bookkeeping and the error handling can't drift between them.
  const write = useCallback(async ({ apply, request, rollback, onSuccess }) => {
    if (!user) return { success: false, error: 'Not signed in' }
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, offline: true } }

    writesInFlightRef.current += 1
    apply()
    try {
      const { data, error } = await request()
      if (error) {
        rollback()
        reportError(error)
        return { success: false, error: error.message || FALLBACK_MESSAGE }
      }
      if (onSuccess) onSuccess(data)
      return { success: true }
    } catch (err) {
      rollback()
      if (isConnectivityError(err, isOnlineRef.current)) {
        notifyOffline()
        return { success: false, offline: true }
      }
      reportError(err)
      return { success: false, error: err.message || FALLBACK_MESSAGE }
    } finally {
      writesInFlightRef.current -= 1
    }
  }, [user, isOnlineRef, notifyOffline])

  // 'savings_goal_reached' — the moment what a goal holds first meets its
  // target, which is when the goal page celebrates. Told apart from
  // 'savings_goal_completed', which is a later, deliberate "mark as done". It
  // fires from whatever caused the crossing (a deposit, an edited entry, a lowered
  // target), once per crossing. Like the other events, it carries no names or
  // amounts.
  // A loan reaching what it owes is 'debt_cleared' (paid off) rather than a
  // savings event, so the two don't mix in the numbers.
  const trackReached = useCallback((goal, savedBefore, savedAfter, targetAfter = goal.target) => {
    if (savedBefore >= goal.target || savedAfter < targetAfter) return
    posthog?.capture(goal.kind === 'debt' ? 'debt_cleared' : 'savings_goal_reached', { days_since_created: daysSince(goal.createdAt) })
  }, [posthog])

  // `kind` — 'savings' (default, every existing caller) or 'debt'. A debt
  // goal is the exact same shape read backwards: `target` is what was
  // borrowed rather than what's being saved toward, and `saved` (below,
  // still just summed from entries) is what's been paid off rather than
  // what's been set aside. Nothing else about the read/write path changes.
  const addGoal = useCallback(async ({ name, target, location, kind = 'savings', debtType = null, tenureMonths = null, emisPaidBefore = 0, firstEmiDate = null, emiAmount = null }) => {
    // Client-generated so the optimistic row and the server row share an id.
    const id = Crypto.randomUUID()
    const goal = {
      id,
      name:         name.trim(),
      target:       parseFloat(target),
      location:     (location || '').trim(),
      kind,
      debtType,
      tenureMonths,
      emisPaidBefore,
      firstEmiDate,
      emiAmount,
      completedAt:  null,
      createdAt:    new Date().toISOString(),
    }
    const result = await write({
      apply: () => setStore(s => ({ ...s, goals: [...s.goals, goal] })),
      request: () => supabase.from('savings_goals')
        .insert({
          id, user_id: user.id, name: goal.name, target_amount: goal.target, location: goal.location, kind,
          debt_type: debtType, tenure_months: tenureMonths, emis_paid: emisPaidBefore,
          first_emi_date: firstEmiDate, emi_amount: emiAmount,
        })
        .select().single(),
      rollback: () => setStore(s => ({ ...s, goals: s.goals.filter(g => g.id !== id) })),
      onSuccess: row => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? goalFromRow(row) : g) })),
    })
    if (result.success) {
      hapticAdded()
      // Like every event here, no names or amounts: for a loan, only its shape
      // (EMI or flexible) and, for an EMI loan, how many EMIs it runs.
      if (kind === 'debt') posthog?.capture('debt_created', { debt_type: debtType, tenure_months: tenureMonths })
      else posthog?.capture('savings_goal_created')
      return { ...result, id }
    }
    return result
  }, [write, user, posthog])

  const editGoal = useCallback(async (id, { name, target, location, tenureMonths = null, emisPaidBefore = 0, firstEmiDate = null, emiAmount = null }) => {
    const prev = storeRef.current.goals.find(g => g.id === id)
    if (!prev) return { success: false, error: FALLBACK_MESSAGE }
    // `debtType` is deliberately not editable — set once when the goal is
    // created (see GoalSheet's own type-selector step) and left alone here,
    // the same way `kind` itself never changes after a goal exists.
    const next = { ...prev, name: name.trim(), target: parseFloat(target), location: (location || '').trim(), tenureMonths, emisPaidBefore, firstEmiDate, emiAmount }
    const saved = netFor(storeRef.current.entries, id)
    const result = await write({
      apply: () => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? next : g) })),
      request: () => supabase.from('savings_goals')
        .update({
          name: next.name, target_amount: next.target, location: next.location,
          tenure_months: tenureMonths, emis_paid: emisPaidBefore, first_emi_date: firstEmiDate, emi_amount: emiAmount,
        })
        .eq('id', id).eq('user_id', user.id),
      rollback: () => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? prev : g) })),
    })
    // Lowering the target to what's already saved reaches it too.
    if (result.success) trackReached(prev, saved, saved, next.target)
    return result
  }, [write, user, trackReached])

  // Entries go with it — the FK cascades server-side, so this only has to
  // mirror that locally.
  const deleteGoal = useCallback(async (id) => {
    const prevGoal = storeRef.current.goals.find(g => g.id === id)
    const prevEntries = storeRef.current.entries.filter(e => e.goalId === id)
    if (!prevGoal) return { success: false, error: FALLBACK_MESSAGE }
    const result = await write({
      apply: () => setStore(s => ({
        goals: s.goals.filter(g => g.id !== id),
        entries: s.entries.filter(e => e.goalId !== id),
      })),
      request: () => supabase.from('savings_goals').delete().eq('id', id).eq('user_id', user.id),
      rollback: () => setStore(s => ({
        goals: [...s.goals, prevGoal].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        entries: [...s.entries, ...prevEntries],
      })),
    })
    if (result.success) hapticDeleted()
    return result
  }, [write, user])

  const setGoalCompleted = useCallback(async (id, done) => {
    const prev = storeRef.current.goals.find(g => g.id === id)
    if (!prev) return { success: false, error: FALLBACK_MESSAGE }
    const completedAt = done ? new Date().toISOString() : null
    const result = await write({
      apply: () => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? { ...g, completedAt } : g) })),
      request: () => supabase.from('savings_goals')
        .update({ completed_at: completedAt })
        .eq('id', id).eq('user_id', user.id),
      rollback: () => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? prev : g) })),
    })
    if (result.success && done) {
      // A loan marked cleared by hand (or closed early) is its own event.
      posthog?.capture(prev.kind === 'debt' ? 'debt_marked_cleared' : 'savings_goal_completed', { days_since_created: daysSince(prev.createdAt) })
    }
    return result
  }, [write, user, posthog])

  // What a goal holds, optionally as if one entry weren't there. Deliberately
  // not clamped at zero: the callers use it to refuse a change that would push
  // a goal below zero, which a clamp would hide.
  const netFor = (entries, goalId, excludeEntryId) => entries.reduce((sum, e) => {
    if (e.goalId !== goalId || e.id === excludeEntryId) return sum
    return sum + (e.type === 'add' ? e.amount : -e.amount)
  }, 0)

  // `date` is the day the money was set aside or taken out, chosen in the
  // sheet; it defaults to today.
  const addEntry = useCallback(async (goalId, { type, amount, note, date }) => {
    const value = parseFloat(amount)
    if (type === 'withdraw' && value > netFor(storeRef.current.entries, goalId)) {
      return { success: false, error: "You can't withdraw more than what's saved." }
    }
    const goal = storeRef.current.goals.find(g => g.id === goalId)
    const saved = netFor(storeRef.current.entries, goalId)
    const id = Crypto.randomUUID()
    const entry = { id, goalId, type, amount: value, date: date || today(), note: (note || '').trim(), createdAt: new Date().toISOString(), transactionId: null }
    const result = await write({
      apply: () => setStore(s => ({ ...s, entries: [...s.entries, entry] })),
      request: () => supabase.from('savings_entries').insert({
        id, goal_id: goalId, user_id: user.id, type, amount: value, date: entry.date, note: entry.note,
      }),
      rollback: () => setStore(s => ({ ...s, entries: s.entries.filter(e => e.id !== id) })),
    })
    if (result.success) {
      hapticAdded()
      // A payment on a loan is 'debt_payment_added'; money moved on a savings
      // goal keeps 'savings_money_moved'.
      if (goal?.kind === 'debt') posthog?.capture('debt_payment_added', { debt_type: goal.debtType, type })
      else posthog?.capture('savings_money_moved', { type })
      if (goal) trackReached(goal, saved, saved + (type === 'add' ? value : -value))
      return { ...result, id }
    }
    return result
  }, [write, user, posthog, trackReached])

  // Mirrors a debt payment into the main transaction list as a real expense —
  // asked about after the payment is logged here (see SavingsSheetsHost's
  // own confirm prompt), never automatic: paying down a loan isn't itself a
  // home-screen expense unless the user says it should be counted as one.
  // The caller (SavingsSheetsHost's resolveEmiConfirm) links the returned id
  // back onto the entry via linkEntryTransaction below, the same way Budget's
  // own checked lines link theirs (see useBudgetPlan.setChecked) — so
  // deleting the entry later takes this expense with it instead of leaving
  // it behind (see deleteEntry).
  const logEntryAsExpense = useCallback(async ({ amount, date, description }) => {
    const id = Crypto.randomUUID()
    const result = await write({
      apply: () => {},
      rollback: () => {},
      request: () => supabase.from('transactions').insert({
        id, user_id: user.id, type: 'expense', amount: parseFloat(amount), date: date || today(), description: description || 'Payment',
      }),
      onSuccess: () => onEntryLogged?.(),
    })
    return result.success ? { ...result, id } : result
  }, [write, user, onEntryLogged])

  // Only writes the link — the entry itself already exists (logEntryAsExpense
  // is offered only after the payment's own entry is saved), so this is a
  // plain column update, not a new row.
  const linkEntryTransaction = useCallback(async (entryId, transactionId) => {
    const prev = storeRef.current.entries.find(e => e.id === entryId)
    if (!prev) return { success: false, error: FALLBACK_MESSAGE }
    return write({
      apply: () => setStore(s => ({ ...s, entries: s.entries.map(e => e.id === entryId ? { ...e, transactionId } : e) })),
      request: () => supabase.from('savings_entries').update({ transaction_id: transactionId }).eq('id', entryId).eq('user_id', user.id),
      rollback: () => setStore(s => ({ ...s, entries: s.entries.map(e => e.id === entryId ? prev : e) })),
    })
  }, [write, user])

  const updateEntry = useCallback(async (id, { type, amount, note, date }) => {
    const prev = storeRef.current.entries.find(e => e.id === id)
    if (!prev) return { success: false, error: FALLBACK_MESSAGE }
    const value = parseFloat(amount)
    // What the goal would hold after the edit — one that would push it below
    // zero (e.g. turning an add into a withdrawal bigger than the rest) is
    // refused rather than silently clamped.
    const others = netFor(storeRef.current.entries, prev.goalId, id)
    const after = type === 'add' ? others + value : others - value
    if (after < 0) return { success: false, error: "You can't withdraw more than what's saved." }
    const next = { ...prev, type, amount: value, note: (note || '').trim(), date: date || prev.date }
    const goal = storeRef.current.goals.find(g => g.id === prev.goalId)
    const before = netFor(storeRef.current.entries, prev.goalId)
    const result = await write({
      apply: () => setStore(s => ({ ...s, entries: s.entries.map(e => e.id === id ? next : e) })),
      request: () => supabase.from('savings_entries')
        .update({ type, amount: value, note: next.note, date: next.date })
        .eq('id', id).eq('user_id', user.id),
      rollback: () => setStore(s => ({ ...s, entries: s.entries.map(e => e.id === id ? prev : e) })),
    })
    if (result.success && goal) trackReached(goal, before, after)
    return result
  }, [write, user, trackReached])

  const deleteEntry = useCallback(async (id) => {
    const prev = storeRef.current.entries.find(e => e.id === id)
    if (!prev) return { success: false, error: FALLBACK_MESSAGE }
    // Removing an add can leave a later withdrawal with nothing behind it.
    if (netFor(storeRef.current.entries, prev.goalId, id) < 0) {
      return { success: false, error: 'Remove the withdrawals that depend on this first.' }
    }
    const result = await write({
      apply: () => setStore(s => ({ ...s, entries: s.entries.filter(e => e.id !== id) })),
      request: () => supabase.from('savings_entries').delete().eq('id', id).eq('user_id', user.id),
      rollback: () => setStore(s => ({ ...s, entries: [...s.entries, prev] })),
    })
    if (!result.success) return result
    hapticDeleted()
    // The expense this payment was mirrored into (if the user said yes to
    // that prompt) goes with it — left behind, it would show on Home with
    // nothing in the loan's own history left to explain it. Mirrors Budget's
    // own checked-line delete (see useBudgetPlan.deleteItem).
    if (prev.transactionId) {
      const { error: txError } = await supabase.from('transactions').delete().eq('id', prev.transactionId).eq('user_id', user.id)
      if (txError) { reportError(txError); return result }
      onEntryLogged?.()
      return { ...result, removedTransaction: true }
    }
    return result
  }, [write, user, onEntryLogged])

  // Brings in goals and entries from a spreadsheet: `goals` are { name, target,
  // completed } and `entries` are { goalName, type, amount, date, note }. An entry
  // goes to the goal of that name — one the account already has, else one of
  // `goals` — and a goal that already exists is left as it is, entries added to it.
  // Goals go in before their entries, each in chunks, reporting progress as
  // (done, total). Not optimistic and not rolled back: it stops at the first
  // failure, reporting what went in, and either way ends with a refresh so the
  // list shows what is really there.
  const importSavings = useCallback(async (goals, entries, onProgress) => {
    if (!user) return { success: false, error: 'Not signed in', goals: 0, entries: 0 }
    if (!goals.length && !entries.length) return { success: true, goals: 0, entries: 0 }
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, offline: true, goals: 0, entries: 0 } }

    const idByName = new Map(storeRef.current.goals.map(g => [g.name.toLowerCase(), g.id]))
    const createdAt = new Date().toISOString()
    const newGoals = []
    for (const g of goals) {
      const key = g.name.toLowerCase()
      if (idByName.has(key)) continue
      const id = Crypto.randomUUID()
      idByName.set(key, id)
      newGoals.push({
        id, user_id: user.id, name: g.name, target_amount: g.target,
        completed_at: g.completed ? createdAt : null,
      })
    }
    const entryRows = entries.flatMap(e => {
      const goalId = idByName.get(e.goalName.toLowerCase())
      return goalId ? [{ goal_id: goalId, user_id: user.id, type: e.type, amount: e.amount, date: e.date, note: e.note }] : []
    })

    const total = newGoals.length + entryRows.length
    const done = { goals: 0, entries: 0 }
    const insertAll = async (table, rows, counter) => {
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE)
        const { error } = await supabase.from(table).insert(chunk)
        if (error) return error
        done[counter] += chunk.length
        onProgress?.(done.goals + done.entries, total)
      }
      return null
    }

    writesInFlightRef.current += 1
    let failure = null
    try {
      failure = await insertAll('savings_goals', newGoals, 'goals') || await insertAll('savings_entries', entryRows, 'entries')
    } catch (err) {
      failure = err
    } finally {
      writesInFlightRef.current -= 1
    }
    await refresh()

    if (failure) {
      if (isConnectivityError(failure, isOnlineRef.current)) {
        notifyOffline()
        return { success: false, offline: true, ...done }
      }
      reportError(failure)
      return { success: false, error: failure.message || FALLBACK_MESSAGE, ...done }
    }
    hapticAdded()
    return { success: true, ...done }
  }, [user, isOnlineRef, notifyOffline, refresh])

  // Goals with their derived numbers attached, split into active / completed
  // — and, before that, split by `kind` so a debt's numbers never mix into a
  // savings total or vice versa. Money in a completed goal is treated as
  // spent (or, for debt, paid off) on the thing it was for, so it isn't
  // counted in the total.
  //
  // `remaining` (target - saved, floored at 0) is what a debt's own UI shows
  // as its headline figure — unused by Savings' own UI today, but it's the
  // same derived-from-entries number either way, so it's computed once here
  // rather than requiring every caller to redo `target - saved` itself.
  const splitByStatus = (goals) => {
    // Closest to done first, by the same `percent` the list itself shows (a
    // count ratio for EMI debt, a money ratio for everything else — see
    // `derived`'s own comment on why those differ); a dead heat keeps the
    // order the goals were created in.
    const active = goals
      .filter(g => !g.completedAt)
      .sort((x, y) => y.percent - x.percent || x.createdAt.localeCompare(y.createdAt))
    const completed = goals.filter(g => g.completedAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    return { all: goals, active, completed, total: active.reduce((sum, g) => sum + g.saved, 0) }
  }

  const derived = useMemo(() => {
    const entriesByGoal = new Map()
    for (const e of store.entries) {
      if (!entriesByGoal.has(e.goalId)) entriesByGoal.set(e.goalId, [])
      entriesByGoal.get(e.goalId).push(e)
    }
    const all = store.goals.map(g => {
      const entries = (entriesByGoal.get(g.id) || []).slice().sort(byDateDesc)

      // A debt goal saved before the EMI/Flexible split existed has no
      // `debtType` on file — inferred here rather than needing every old
      // goal migrated by hand: EMI-shaped data (a tenure or an EMI amount)
      // means it was being tracked like a fixed-schedule loan, so treat it
      // as 'emi'; otherwise it was always just a plain running balance, so
      // 'flexible'. A savings goal never has one either way.
      const debtType = g.kind !== 'debt' ? null
        : g.debtType || (g.tenureMonths != null || g.emiAmount != null ? 'emi' : 'flexible')

      // Both dates below are plain "YYYY-MM-DD"/ISO strings — sliced
      // directly rather than built into Date objects, since a native Date
      // constructor parses "YYYY-MM-DD" as UTC midnight, which can land a
      // day early in the local timezone right at a month boundary.
      const monthIndex = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1
      // Keeps the SAME day-of-month `firstEmiDate` itself has (an EMI is
      // due the same date each month) rather than resetting to the 1st —
      // "Next payment" should read "5 Oct", not "1 Oct", for a loan whose
      // first EMI was actually on the 5th.
      const dateFromMonthIndex = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-${g.firstEmiDate.slice(8, 10)}`

      // EMI debt's whole model, in order — a schedule measured in EMIs, not
      // a tracked balance (there's no such balance any more; see emiAmount's
      // own comment on why that was tried and dropped). Everything below is
      // built from Monthly EMI, Total EMIs and `emisPaid` — how many of
      // those EMIs are behind the loan, which is the typed-in head start
      // plus whatever has actually been paid since (see its own comment). No
      // part of it is worked out from a date: First EMI only labels the
      // calendar, see nextEmiDate/estimatedFinishDate below.
      //  - totalRepayment: what the loan costs altogether, on schedule.
      //  - extraToPay: how much MORE than was borrowed that schedule adds
      //    up to. Never called "interest" — the gap can include other
      //    charges too, and this app doesn't know the split either way.
      //  - emisRemaining / remaining ("left to pay"): what's still owed
      //    going by the SCHEDULE, not a running balance — this is why
      //    `remaining` can be more than `target` for a loan early in its
      //    life; a schedule includes what's still to come, not just
      //    principal.
      //  - percent: EMIs paid over the total, a plain count ratio — not a
      //    money ratio, since "money paid / money owed" would undercount
      //    progress for the same reason `remaining` runs ahead of `target`.
      const entriesSaved = Math.max(0, entries.reduce((sum, e) => sum + (e.type === 'add' ? e.amount : -e.amount), 0))

      const totalRepayment = debtType === 'emi' && g.tenureMonths != null && g.emiAmount != null
        ? g.emiAmount * g.tenureMonths
        : null
      const extraToPay = totalRepayment != null ? Math.max(0, totalRepayment - g.target) : null

      // How many EMIs are actually behind this loan: the count typed in when
      // it was added ("EMIs already paid" — the ones that predate this app
      // tracking it) plus every whole EMI's worth of money logged against it
      // since.
      //
      // Derived, never stored — the same rule everything else here follows
      // (see this hook's own note on a goal's saved amount), so correcting or
      // deleting a mistaken payment can't leave a stale count behind. And
      // counting by the money a payment actually carries, rather than by one
      // per entry, is what lets a single lump sum settle the months it really
      // covers: clearing the whole balance in one go clears the loan, instead
      // of registering as a single month.
      //
      // The epsilon is for the float division alone: an EMI that doesn't
      // divide cleanly (₹8,333.33) can land a whole number of payments a
      // hair under the integer they should make, and floor would eat one.
      const emisFromPayments = debtType === 'emi' && g.emiAmount > 0
        ? Math.floor(entriesSaved / g.emiAmount + 1e-6)
        : 0
      const emisPaidRaw = debtType === 'emi' ? g.emisPaidBefore + emisFromPayments : 0
      const emisPaid = g.tenureMonths != null ? Math.min(g.tenureMonths, emisPaidRaw) : emisPaidRaw
      const emisRemaining = debtType === 'emi' && g.tenureMonths != null ? Math.max(0, g.tenureMonths - emisPaid) : null
      // Null once there's nothing left to pay, or the schedule itself is
      // incomplete (no first-EMI date, or a tenure that's already run out).
      const nextEmiDate = debtType === 'emi' && g.firstEmiDate && emisRemaining > 0
        ? dateFromMonthIndex(monthIndex(g.firstEmiDate) + emisPaid)
        : null
      const estimatedFinishDate = debtType === 'emi' && g.firstEmiDate && g.tenureMonths != null
        ? dateFromMonthIndex(monthIndex(g.firstEmiDate) + g.tenureMonths - 1)
        : null

      // Flexible debt (and every savings goal) is the plain running total of
      // entries logged through this app — there's no schedule to read
      // instead, that total simply IS the whole truth.
      let saved = entriesSaved
      let percent = g.target > 0 ? Math.min(100, Math.round((saved / g.target) * 100)) : 0
      let remaining = Math.max(0, g.target - saved)
      let reached = saved >= g.target
      if (debtType === 'emi') {
        saved = emisPaid * (g.emiAmount ?? 0)
        percent = g.tenureMonths > 0 ? Math.min(100, Math.round((emisPaid / g.tenureMonths) * 100)) : 0
        remaining = emisRemaining != null && g.emiAmount != null ? emisRemaining * g.emiAmount : Math.max(0, g.target - saved)
        reached = g.tenureMonths != null && emisPaid >= g.tenureMonths
      }
      // `debtType` here overrides the raw stored one on the spread, so a goal
      // that predates the EMI/Flexible split reads as its inferred type
      // everywhere without needing a migration. `emisPaidBefore` is left
      // alone on purpose: it stays the raw typed-in seed, because that's what
      // the edit sheet puts back in its own "EMIs already paid" field — the
      // true running count is `emisPaid` beside it, and writing that back as
      // the seed would double-count every payment already logged.
      return {
        ...g, entries, debtType, totalRepayment, extraToPay, emisPaid, emisRemaining, nextEmiDate, estimatedFinishDate,
        saved, percent, remaining, reached,
      }
    })
    return {
      savings: splitByStatus(all.filter(g => g.kind !== 'debt')),
      debt: splitByStatus(all.filter(g => g.kind === 'debt')),
    }
  }, [store])

  return useMemo(() => ({
    goals: derived.savings.active,
    completedGoals: derived.savings.completed,
    allGoals: derived.savings.all,
    totalSaved: derived.savings.total,
    debts: derived.debt.active,
    completedDebts: derived.debt.completed,
    allDebts: derived.debt.all,
    totalOwed: derived.debt.active.reduce((sum, g) => sum + g.remaining, 0),
    loading,
    refresh,
    addGoal,
    editGoal,
    deleteGoal,
    setGoalCompleted,
    addEntry,
    logEntryAsExpense,
    linkEntryTransaction,
    updateEntry,
    deleteEntry,
    importSavings,
  }), [derived, loading, refresh, addGoal, editGoal, deleteGoal, setGoalCompleted, addEntry, logEntryAsExpense, linkEntryTransaction, updateEntry, deleteEntry, importSavings])
}
