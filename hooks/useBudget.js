import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { useNetwork } from '../context/NetworkContext'
import { isConnectivityError } from '../utils/errors'
import { currentMonthYear, getMonthTotal } from '../utils/format'
import { prevMonthYear } from '../utils/monthlyRecap'

function monthStartStr(month, year) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

// A budget "set" while offline only ever needs to remember the latest
// value per month — unlike transactions (many independent rows), setting
// a budget twice for the same month just overwrites, so a single pending
// slot (not an ordered queue) is all this needs.
const pendingKey = (userId) => `okana_pending_budget_${userId}`

async function loadPendingBudget(userId) {
  try {
    const raw = await AsyncStorage.getItem(pendingKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function savePendingBudget(userId, pending) {
  try {
    if (pending) await AsyncStorage.setItem(pendingKey(userId), JSON.stringify(pending))
    else await AsyncStorage.removeItem(pendingKey(userId))
  } catch { /* best-effort, same as the transaction cache */ }
}

// Separate from the pending-write cache above — this is the last
// successfully *synced* budget (both this month's and last month's), used
// purely as an offline fallback so a cold launch with no connection doesn't
// read as "no budget set" and re-trigger the setup prompt for a month that
// already has one. Scoped to the month it was fetched for, same as the
// pending cache, so an old month's cached amount can't silently apply after
// the calendar rolls over.
const syncedKey = (userId) => `okana_synced_budget_${userId}`

async function loadSyncedBudget(userId, monthStart) {
  try {
    const raw = await AsyncStorage.getItem(syncedKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.monthStart === monthStart ? parsed : null
  } catch { return null }
}

async function saveSyncedBudget(userId, monthStart, current, last) {
  try {
    await AsyncStorage.setItem(syncedKey(userId), JSON.stringify({ monthStart, current, last }))
  } catch { /* best-effort */ }
}

// Pushes a still-pending offline budget set to the server, if there is
// one. Discards it instead of applying it if the calendar month has
// rolled over since it was queued — an August budget shouldn't silently
// apply once the app reconnects in September.
async function flushPendingBudget(userId, currentMonthStart) {
  const pending = await loadPendingBudget(userId)
  if (!pending) return
  if (pending.month_start !== currentMonthStart) { await savePendingBudget(userId, null); return }
  try {
    const { error } = await supabase
      .from('monthly_budgets')
      .upsert(
        { user_id: userId, month_start: pending.month_start, budget_amount: pending.budget_amount },
        { onConflict: 'user_id,month_start' },
      )
    if (!error) { await savePendingBudget(userId, null); return }
    // A genuine rejection (not connectivity) would fail the exact same
    // way on every future retry — drop it rather than leaving a stuck
    // "_pending" budget that silently never confirms. The caller's own
    // refresh (right after this) will then show whatever the server
    // actually has for the month instead.
    if (!isConnectivityError(error)) await savePendingBudget(userId, null)
  } catch (err) {
    // A thrown (not returned) error while genuinely offline is expected —
    // leave it queued. Anything else gets the same drop-it treatment.
    if (!isConnectivityError(err)) await savePendingBudget(userId, null)
  }
}

export function useBudget(user, transactions) {
  const { isOnline, isOnlineRef, notifyOffline } = useNetwork()
  const { month, year } = currentMonthYear()
  const monthStart = monthStartStr(month, year)
  const { month: prevMonth, year: prevYear } = prevMonthYear(month, year)
  const prevMonthStart = monthStartStr(prevMonth, prevYear)

  const [budgetRow, setBudgetRow] = useState(null)
  const [lastMonthAmount, setLastMonthAmount] = useState(null)
  const [loading, setLoading] = useState(true)

  // Shows the last synced-to-disk budget immediately on a fresh mount,
  // before the network fetch below even resolves — a cold launch offline
  // would otherwise sit on "no budget" for however long the fetch takes to
  // time out, even for a month that already has one set. Only fills in if
  // refresh() hasn't already set real state by the time this resolves.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    loadSyncedBudget(user.id, monthStart).then(cached => {
      if (cancelled || !cached) return
      if (cached.current) setBudgetRow(prev => prev ?? cached.current)
      if (cached.last != null) setLastMonthAmount(prev => prev ?? cached.last)
    })
    return () => { cancelled = true }
  }, [user, monthStart])

  const refresh = useCallback(async () => {
    if (!user) { setBudgetRow(null); setLastMonthAmount(null); setLoading(false); return }
    setLoading(true)

    async function applyCacheFallback() {
      // Offline (or NetInfo hasn't reported it yet on a cold launch — its
      // first check is async, so `isOnlineRef.current` still defaults true
      // for a moment even with no connection at all) — whatever's already
      // in state is a fine fallback, but if this is a genuinely fresh
      // mount there's nothing there yet, so also pull the last synced
      // budget off disk.
      const cached = await loadSyncedBudget(user.id, monthStart)
      const pending = await loadPendingBudget(user.id)
      if (pending && pending.month_start === monthStart) {
        setBudgetRow(prev => prev ?? { ...(cached?.current || {}), user_id: user.id, month_start: monthStart, budget_amount: pending.budget_amount, _pending: true })
      } else if (cached?.current) {
        setBudgetRow(prev => prev ?? cached.current)
      }
      if (cached?.last != null) setLastMonthAmount(prev => prev ?? cached.last)
    }

    try {
      if (!isOnlineRef.current) {
        await applyCacheFallback()
        return
      }
      await flushPendingBudget(user.id, monthStart)
      const { data, error } = await supabase
        .from('monthly_budgets')
        .select('*')
        .eq('user_id', user.id)
        .in('month_start', [monthStart, prevMonthStart])
      if (error) throw error
      const current = data?.find(row => row.month_start === monthStart)
      const last = data?.find(row => row.month_start === prevMonthStart)

      await saveSyncedBudget(user.id, monthStart, current ?? null, last?.budget_amount ?? null)

      // A flush that failed (still offline, or a genuine rejection) or
      // never ran leaves a pending value sitting in storage — prefer that
      // over whatever the server has for this month, same "local truth
      // for anything still unsynced" rule the transaction list follows.
      const pending = await loadPendingBudget(user.id)
      if (pending && pending.month_start === monthStart) {
        setBudgetRow({ ...(current || {}), user_id: user.id, month_start: monthStart, budget_amount: pending.budget_amount, _pending: true })
      } else {
        setBudgetRow(current || null)
      }
      setLastMonthAmount(last?.budget_amount ?? null)
    } catch {
      // Supabase returns network failures as `{ data: null, error }` rather
      // than throwing, so this catches both that and a genuine thrown
      // error the same way — fall back to the last synced state on disk
      // instead of leaving budgetRow cleared, which would read as "no
      // budget" and re-trigger the setup prompt for a month that already
      // has one.
      await applyCacheFallback()
    } finally {
      setLoading(false)
    }
  }, [user, monthStart, prevMonthStart])

  useEffect(() => { refresh() }, [refresh])

  // Coming back online specifically kicks off a refresh (which flushes
  // any pending budget set first) — mirrors useTransactions' equivalent,
  // so a budget set while offline doesn't just sit there until the
  // Dashboard happens to refocus.
  const wasOnlineRef = useRef(isOnline)
  useEffect(() => {
    const wasOffline = !wasOnlineRef.current
    wasOnlineRef.current = isOnline
    if (user && wasOffline && isOnline) refresh()
  }, [user, isOnline, refresh])

  const setBudget = useCallback(async (amountNumber) => {
    if (!user) return { success: false, error: 'Not signed in' }

    if (!isOnlineRef.current) {
      setBudgetRow(prev => ({ ...(prev || {}), user_id: user.id, month_start: monthStart, budget_amount: amountNumber, _pending: true }))
      await savePendingBudget(user.id, { month_start: monthStart, budget_amount: amountNumber })
      notifyOffline()
      return { success: true, queued: true }
    }

    try {
      const { data, error } = await supabase
        .from('monthly_budgets')
        .upsert(
          { user_id: user.id, month_start: monthStart, budget_amount: amountNumber },
          { onConflict: 'user_id,month_start' },
        )
        .select()
        .single()
      if (error) return { success: false, error: error.message }
      // This set is now the source of truth for the month — drop any
      // stale pending value so a later refresh doesn't reapply an older
      // queued number over it.
      await savePendingBudget(user.id, null)
      setBudgetRow(data)
      return { success: true }
    } catch (err) {
      if (isConnectivityError(err, isOnlineRef.current)) {
        setBudgetRow(prev => ({ ...(prev || {}), user_id: user.id, month_start: monthStart, budget_amount: amountNumber, _pending: true }))
        await savePendingBudget(user.id, { month_start: monthStart, budget_amount: amountNumber })
        notifyOffline()
        return { success: true, queued: true }
      }
      return { success: false, error: err.message || 'Something went wrong. Please try again.' }
    }
  }, [user, monthStart, notifyOffline])

  const spentThisMonth = useMemo(
    () => getMonthTotal(transactions, 'expense', month, year),
    [transactions, month, year],
  )

  const lastMonthSpent = useMemo(
    () => getMonthTotal(transactions, 'expense', prevMonth, prevYear),
    [transactions, prevMonth, prevYear],
  )

  const percent = budgetRow ? Math.round((spentThisMonth / budgetRow.budget_amount) * 100) : null

  return {
    loading,
    hasBudget: !!budgetRow,
    amount: budgetRow?.budget_amount ?? null,
    spentThisMonth,
    lastMonthAmount,
    lastMonthSpent,
    percent,
    setBudget,
    refresh,
  }
}
