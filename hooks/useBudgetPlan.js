import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNetwork } from '../context/NetworkContext'
import { isConnectivityError, reportError } from '../utils/errors'
import { storageKeys } from '../utils/storageKeys'
import { currentMonthYear, today } from '../utils/format'

function monthStartStr(month, year) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

function itemFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    amount: parseFloat(row.amount),
    sortOrder: row.sort_order,
    checkedAt: row.checked_at,
    transactionId: row.transaction_id,
  }
}

const cacheKey = storageKeys.budgetPlan

async function saveCache(userId, store) {
  try { await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(store)) } catch (err) { reportError(err) }
}

async function loadCache(userId) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    reportError(err)
    return null
  }
}

// What you plan to spend before the money lands — line items ("Rent 12,000",
// "Car EMI 15,514") the way a quick note would hold them, not a formal
// budget: no categories, no separate salary/bank figures, just what you
// intend to spend. Checking one off is the point of the whole thing: it
// turns into a real expense (see setChecked below), dated the day it was
// checked, not backdated to whenever it was planned.
//
// NOT scoped to the current calendar month, despite `month_start` existing
// on every row (kept only because the column is `not null` — each item is
// still tagged with whichever month it was first added in, for whatever
// that's worth later, but nothing here reads it back). This used to filter
// by the current month, which silently emptied the whole list the moment a
// month turned over — a line you'd planned and hadn't gotten to yet just
// vanished, with no warning and nothing to undo. The list is a standing
// note now: it carries forward across months on its own, and only actually
// empties when `clearList` is called (see its own comment below) — a
// person's own choice, not the calendar's.
export function useBudgetPlan(onChecked) {
  const { user } = useAuth()
  const { isOnlineRef, notifyOffline } = useNetwork()
  const { month, year } = currentMonthYear()
  const monthStart = monthStartStr(month, year)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const hydratedRef = useRef(false)
  useEffect(() => {
    if (user && hydratedRef.current) saveCache(user.id, { items })
  }, [items, user])

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return }
    try {
      if (!isOnlineRef.current) return
      const { data, error } = await supabase
        .from('budget_plan_items').select('*').eq('user_id', user.id)
        .order('sort_order', { ascending: true })
      if (error) throw error
      hydratedRef.current = true
      setItems(data.map(itemFromRow))
    } catch (err) {
      if (!isConnectivityError(err, isOnlineRef.current)) reportError(err)
    } finally {
      setLoading(false)
    }
  }, [user, isOnlineRef])

  useEffect(() => {
    if (!user) { hydratedRef.current = false; setItems([]); setLoading(false); return }
    let cancelled = false
    loadCache(user.id).then(cached => {
      if (cancelled || !cached) return
      hydratedRef.current = true
      setItems(cached.items)
    })
    refresh()
    return () => { cancelled = true }
  }, [user, refresh])

  const addItem = useCallback(async ({ name = '', amount = 0 }) => {
    if (!user) return { success: false, error: 'Not signed in' }
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, offline: true } }
    const id = Crypto.randomUUID()
    const sortOrder = itemsRef.current.length
    const item = { id, name, amount, sortOrder, checkedAt: null, transactionId: null }
    setItems(s => [...s, item])
    try {
      const { error } = await supabase.from('budget_plan_items').insert({
        id, user_id: user.id, month_start: monthStart, name, amount, sort_order: sortOrder,
      })
      if (error) { setItems(s => s.filter(i => i.id !== id)); reportError(error); return { success: false, error: error.message } }
      return { success: true, id }
    } catch (err) {
      setItems(s => s.filter(i => i.id !== id))
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); return { success: false, offline: true } }
      reportError(err)
      return { success: false, error: err.message || 'Something went wrong. Please try again.' }
    }
  }, [user, monthStart, isOnlineRef, notifyOffline])

  const updateItem = useCallback(async (id, { name, amount }) => {
    if (!user) return { success: false, error: 'Not signed in' }
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, offline: true } }
    const prev = itemsRef.current.find(i => i.id === id)
    if (!prev) return { success: false, error: 'Something went wrong. Please try again.' }
    const next = { ...prev, name: name ?? prev.name, amount: amount ?? prev.amount }
    setItems(s => s.map(i => i.id === id ? next : i))
    try {
      const { error } = await supabase.from('budget_plan_items')
        .update({ name: next.name, amount: next.amount }).eq('id', id).eq('user_id', user.id)
      if (error) { setItems(s => s.map(i => i.id === id ? prev : i)); reportError(error); return { success: false, error: error.message } }
      return { success: true }
    } catch (err) {
      setItems(s => s.map(i => i.id === id ? prev : i))
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); return { success: false, offline: true } }
      reportError(err)
      return { success: false, error: err.message || 'Something went wrong. Please try again.' }
    }
  }, [user, isOnlineRef, notifyOffline])

  const deleteItem = useCallback(async (id) => {
    if (!user) return { success: false, error: 'Not signed in' }
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, offline: true } }
    const prevItems = itemsRef.current
    const item = prevItems.find(i => i.id === id)
    setItems(s => s.filter(i => i.id !== id))
    try {
      const { error } = await supabase.from('budget_plan_items').delete().eq('id', id).eq('user_id', user.id)
      if (error) { setItems(prevItems); reportError(error); return { success: false, error: error.message } }
      // A checked line's own expense goes with it — left behind, it would
      // show on Home with nothing in the plan any more to explain it.
      if (item?.transactionId) {
        const { error: txError } = await supabase.from('transactions').delete().eq('id', item.transactionId).eq('user_id', user.id)
        if (txError) reportError(txError)
        else onChecked?.()
      }
      return { success: true }
    } catch (err) {
      setItems(prevItems)
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); return { success: false, offline: true } }
      reportError(err)
      return { success: false, error: err.message || 'Something went wrong. Please try again.' }
    }
  }, [user, isOnlineRef, notifyOffline, onChecked])

  // Checking a line off is the point of the whole thing: it's done. Whether
  // that also becomes a real expense on today's date (not backdated to
  // whenever the line was planned) is now the caller's own choice — see
  // BudgetPlan's confirm prompt — so `addTransaction` (true by default,
  // every existing caller) can be turned off to just mark the line paid
  // with no transaction of its own. Unchecking removes that expense again if
  // there was one, the same way an undo would. `onChecked` lets the caller's
  // own transaction list (Home's useTransactions, which has no way to know
  // about either write on its own) refresh once it's done.
  const setChecked = useCallback(async (id, checked, { addTransaction = true } = {}) => {
    if (!user) return { success: false, error: 'Not signed in' }
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, offline: true } }
    const prev = itemsRef.current.find(i => i.id === id)
    if (!prev) return { success: false, error: 'Something went wrong. Please try again.' }

    if (checked && !addTransaction) {
      if (!(prev.amount > 0)) return { success: false, error: 'Add an amount before checking this off.' }
      const checkedAt = new Date().toISOString()
      setItems(s => s.map(i => i.id === id ? { ...i, checkedAt, transactionId: null } : i))
      try {
        const { error } = await supabase.from('budget_plan_items')
          .update({ checked_at: checkedAt, transaction_id: null }).eq('id', id).eq('user_id', user.id)
        if (error) { setItems(s => s.map(i => i.id === id ? prev : i)); reportError(error); return { success: false, error: error.message } }
        return { success: true }
      } catch (err) {
        setItems(s => s.map(i => i.id === id ? prev : i))
        if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); return { success: false, offline: true } }
        reportError(err)
        return { success: false, error: err.message || 'Something went wrong. Please try again.' }
      }
    }

    if (checked) {
      if (!(prev.amount > 0)) return { success: false, error: 'Add an amount before checking this off.' }
      const txId = Crypto.randomUUID()
      const checkedAt = new Date().toISOString()
      setItems(s => s.map(i => i.id === id ? { ...i, checkedAt, transactionId: txId } : i))
      try {
        const { error: txError } = await supabase.from('transactions').insert({
          id: txId, user_id: user.id, type: 'expense', amount: prev.amount, date: today(), description: prev.name || 'Planned expense',
        })
        if (txError) { setItems(s => s.map(i => i.id === id ? prev : i)); reportError(txError); return { success: false, error: txError.message } }
        const { error } = await supabase.from('budget_plan_items')
          .update({ checked_at: checkedAt, transaction_id: txId }).eq('id', id).eq('user_id', user.id)
        if (error) {
          // The expense landed but the line couldn't be marked — undo the
          // expense too, so a retry doesn't double it up.
          await supabase.from('transactions').delete().eq('id', txId)
          setItems(s => s.map(i => i.id === id ? prev : i))
          reportError(error)
          return { success: false, error: error.message }
        }
        onChecked?.()
        return { success: true }
      } catch (err) {
        setItems(s => s.map(i => i.id === id ? prev : i))
        if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); return { success: false, offline: true } }
        reportError(err)
        return { success: false, error: err.message || 'Something went wrong. Please try again.' }
      }
    }

    setItems(s => s.map(i => i.id === id ? { ...i, checkedAt: null, transactionId: null } : i))
    try {
      const { error } = await supabase.from('budget_plan_items')
        .update({ checked_at: null, transaction_id: null }).eq('id', id).eq('user_id', user.id)
      if (error) { setItems(s => s.map(i => i.id === id ? prev : i)); reportError(error); return { success: false, error: error.message } }
      if (prev.transactionId) {
        const { error: txError } = await supabase.from('transactions').delete().eq('id', prev.transactionId).eq('user_id', user.id)
        if (txError) reportError(txError)
        else onChecked?.()
      }
      return { success: true }
    } catch (err) {
      setItems(s => s.map(i => i.id === id ? prev : i))
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); return { success: false, offline: true } }
      reportError(err)
      return { success: false, error: err.message || 'Something went wrong. Please try again.' }
    }
  }, [user, isOnlineRef, notifyOffline, onChecked])

  // Checked items are done — money already accounted for as a real expense
  // (or marked paid with no expense of its own, see `setChecked` above
  // either way). Counting them here too would double them up against
  // whichever of those already happened, so the total is what's still
  // ahead of you, not everything you ever planned.
  const total = useMemo(() => items.reduce((sum, i) => sum + (i.checkedAt ? 0 : i.amount), 0), [items])

  // The list's own reset, now that nothing clears it automatically (see this
  // hook's own top comment) — removes every line, checked or not, and takes
  // each checked one's linked expense with it, the same reasoning as
  // `deleteItem` above just for the whole list in one request rather than
  // one delete per line.
  const clearList = useCallback(async () => {
    if (!user) return { success: false, error: 'Not signed in' }
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, offline: true } }
    const prevItems = itemsRef.current
    if (prevItems.length === 0) return { success: true }
    const transactionIds = prevItems.filter(i => i.transactionId).map(i => i.transactionId)
    setItems([])
    try {
      const { error } = await supabase.from('budget_plan_items').delete().eq('user_id', user.id)
      if (error) { setItems(prevItems); reportError(error); return { success: false, error: error.message } }
      if (transactionIds.length) {
        const { error: txError } = await supabase.from('transactions').delete().eq('user_id', user.id).in('id', transactionIds)
        if (txError) reportError(txError)
        else onChecked?.()
      }
      return { success: true }
    } catch (err) {
      setItems(prevItems)
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); return { success: false, offline: true } }
      reportError(err)
      return { success: false, error: err.message || 'Something went wrong. Please try again.' }
    }
  }, [user, isOnlineRef, notifyOffline, onChecked])

  return useMemo(() => ({
    loading,
    items,
    total,
    addItem,
    updateItem,
    deleteItem,
    setChecked,
    clearList,
    refresh,
  }), [loading, items, total, addItem, updateItem, deleteItem, setChecked, clearList, refresh])
}
