import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { usePostHog } from 'posthog-react-native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNetwork } from '../context/NetworkContext'
import { isConnectivityError, reportError } from '../utils/errors'
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
const OFFLINE_MESSAGE = "You're offline. Try again once you're back online."
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

const cacheKey = (userId) => `okana_savings_${userId}`

async function saveCache(userId, store) {
  try { await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(store)) } catch { /* best-effort */ }
}

async function loadCache(userId) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

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
// Online-only, unlike transactions: writes need a connection and fail with
// the usual offline notice rather than being queued. Reads still fall back to
// the cached copy, so the list is viewable offline.
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
        if (goalsRes.error || entriesRes.error) return // keep showing what we have
        if (writesInFlightRef.current > 0) return
        hydratedRef.current = true
        setStore({
          goals: goalsRes.data.map(goalFromRow),
          entries: entriesRes.data.map(entryFromRow),
        })
      } catch {
        // Network failure — keep showing cached data.
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
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, error: OFFLINE_MESSAGE } }

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
        return { success: false, error: OFFLINE_MESSAGE }
      }
      reportError(err)
      return { success: false, error: err.message || FALLBACK_MESSAGE }
    } finally {
      writesInFlightRef.current -= 1
    }
  }, [user, isOnlineRef, notifyOffline])

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
    return write({
      apply: () => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? next : g) })),
      request: () => supabase.from('savings_goals')
        .update({ name: next.name, target_amount: next.target })
        .eq('id', id).eq('user_id', user.id),
      rollback: () => setStore(s => ({ ...s, goals: s.goals.map(g => g.id === id ? prev : g) })),
    })
  }, [write, user])

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
    if (result.success && done) posthog?.capture('savings_goal_completed')
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
    }
    return result
  }, [write, user, posthog])

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
    return write({
      apply: () => setStore(s => ({ ...s, entries: s.entries.map(e => e.id === id ? next : e) })),
      request: () => supabase.from('savings_entries')
        .update({ type, amount: value, note: next.note, date: next.date })
        .eq('id', id).eq('user_id', user.id),
      rollback: () => setStore(s => ({ ...s, entries: s.entries.map(e => e.id === id ? prev : e) })),
    })
  }, [write, user])

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
    const active = all.filter(g => !g.completedAt)
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
  }), [derived, loading, refresh, addGoal, editGoal, deleteGoal, setGoalCompleted, addEntry, updateEntry, deleteEntry])
}
