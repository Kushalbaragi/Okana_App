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
    id:          row.id,
    name:        row.name,
    target:      parseFloat(row.target_amount),
    completedAt: row.completed_at,
    createdAt:   row.created_at,
  }
}

function entryFromRow(row) {
  return {
    id:        row.id,
    goalId:    row.goal_id,
    type:      row.type,
    amount:    parseFloat(row.amount),
    date:      row.date,
    note:      row.note,
    createdAt: row.created_at,
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
export function useSavings() {
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
  const trackReached = useCallback((goal, savedBefore, savedAfter, targetAfter = goal.target) => {
    if (savedBefore >= goal.target || savedAfter < targetAfter) return
    posthog?.capture('savings_goal_reached', { days_since_created: daysSince(goal.createdAt) })
  }, [posthog])

  const addGoal = useCallback(async ({ name, target }) => {
    // Client-generated so the optimistic row and the server row share an id.
    const id = Crypto.randomUUID()
    const goal = {
      id,
      name:        name.trim(),
      target:      parseFloat(target),
      completedAt: null,
      createdAt:   new Date().toISOString(),
    }
    const result = await write({
      apply: () => setStore(s => ({ ...s, goals: [...s.goals, goal] })),
      request: () => supabase.from('savings_goals')
        .insert({ id, user_id: user.id, name: goal.name, target_amount: goal.target })
        .select().single(),
      rollback: () => setStore(s => ({ ...s, goals: s.goals.filter(g => g.id !== id) })),
      onSuccess: row => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? goalFromRow(row) : g) })),
    })
    if (result.success) {
      hapticAdded()
      posthog?.capture('savings_goal_created')
      return { ...result, id }
    }
    return result
  }, [write, user, posthog])

  const editGoal = useCallback(async (id, { name, target }) => {
    const prev = storeRef.current.goals.find(g => g.id === id)
    if (!prev) return { success: false, error: FALLBACK_MESSAGE }
    const next = { ...prev, name: name.trim(), target: parseFloat(target) }
    const saved = netFor(storeRef.current.entries, id)
    const result = await write({
      apply: () => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? next : g) })),
      request: () => supabase.from('savings_goals')
        .update({ name: next.name, target_amount: next.target })
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
    if (result.success && done) posthog?.capture('savings_goal_completed', { days_since_created: daysSince(prev.createdAt) })
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
    const entry = { id, goalId, type, amount: value, date: date || today(), note: (note || '').trim(), createdAt: new Date().toISOString() }
    const result = await write({
      apply: () => setStore(s => ({ ...s, entries: [...s.entries, entry] })),
      request: () => supabase.from('savings_entries').insert({
        id, goal_id: goalId, user_id: user.id, type, amount: value, date: entry.date, note: entry.note,
      }),
      rollback: () => setStore(s => ({ ...s, entries: s.entries.filter(e => e.id !== id) })),
    })
    if (result.success) {
      hapticAdded()
      posthog?.capture('savings_money_moved', { type })
      if (goal) trackReached(goal, saved, saved + (type === 'add' ? value : -value))
    }
    return result
  }, [write, user, posthog, trackReached])

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
    if (result.success) hapticDeleted()
    return result
  }, [write, user])

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

  // Goals with their derived numbers attached, split into active / completed.
  // Money in a completed goal is treated as spent on the thing it was for, so
  // it isn't counted in the total.
  const derived = useMemo(() => {
    const entriesByGoal = new Map()
    for (const e of store.entries) {
      if (!entriesByGoal.has(e.goalId)) entriesByGoal.set(e.goalId, [])
      entriesByGoal.get(e.goalId).push(e)
    }
    const all = store.goals.map(g => {
      const entries = (entriesByGoal.get(g.id) || []).slice().sort(byDateDesc)
      const saved = Math.max(0, entries.reduce((sum, e) => sum + (e.type === 'add' ? e.amount : -e.amount), 0))
      const percent = g.target > 0 ? Math.min(100, Math.round((saved / g.target) * 100)) : 0
      return { ...g, entries, saved, percent, reached: saved >= g.target }
    })
    // Closest to done first. Compared on the exact ratio rather than the
    // rounded percent the list shows, so two goals both at "61%" (or both capped
    // at 100%) still order by who is really further along; a dead heat keeps the
    // order the goals were created in.
    const active = all
      .filter(g => !g.completedAt)
      .sort((x, y) => (y.saved / y.target) - (x.saved / x.target) || x.createdAt.localeCompare(y.createdAt))
    const completed = all.filter(g => g.completedAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    return {
      all,
      active,
      completed,
      totalSaved: active.reduce((sum, g) => sum + g.saved, 0),
    }
  }, [store])

  return useMemo(() => ({
    goals: derived.active,
    completedGoals: derived.completed,
    allGoals: derived.all,
    totalSaved: derived.totalSaved,
    loading,
    refresh,
    addGoal,
    editGoal,
    deleteGoal,
    setGoalCompleted,
    addEntry,
    updateEntry,
    deleteEntry,
    importSavings,
  }), [derived, loading, refresh, addGoal, editGoal, deleteGoal, setGoalCompleted, addEntry, updateEntry, deleteEntry, importSavings])
}
