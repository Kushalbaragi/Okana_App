import { useState, useEffect, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNetwork } from '../context/NetworkContext'
import { isConnectivityError } from '../utils/errors'
import { hapticAdded, hapticDeleted } from '../utils/haptics'
import { loadQueue, saveQueue, enqueue, collapseQueue, mergeWithPending, withQueueLock } from '../utils/syncQueue'

function fromRow(row) {
  return {
    id:          row.id,
    type:        row.type,
    amount:      parseFloat(row.amount),
    date:        row.date,
    description: row.description,
    createdAt:   row.created_at,
  }
}

const cacheKey = (userId) => `okana_txs_${userId}`

async function saveCache(userId, txs) {
  try { await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(txs)) } catch { /* ignore */ }
}

async function loadCache(userId) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Replays whatever's still queued, in order. A connectivity failure stops
// the whole flush right there — everything from that point on stays
// queued for the next attempt, since retrying in order matters (an edit
// queued after an add for the same row needs that add to have landed
// first). A *genuine* rejection for one specific item (bad data, a
// constraint violation) is different: retrying it later would fail the
// same way every time, so rather than let one bad item block every
// mutation queued after it forever, that one item is dropped and the
// flush continues — see mergeWithPending for why dropping is safe (the
// next refresh reconciles local state back to whatever the server
// actually has for it).
//
// Wrapped in withQueueLock so this can't interleave with a concurrent
// enqueue() — otherwise a mutation queued mid-flush could load the
// pre-flush queue and overwrite this function's own save with a stale
// copy, silently reintroducing an item that just successfully synced.
async function flushQueue(userId) {
  return withQueueLock(userId, async () => {
    const queue = collapseQueue(await loadQueue(userId))
    const remaining = []

    for (let i = 0; i < queue.length; i++) {
      const op = queue[i]
      let error
      try {
        if (op.type === 'add') {
          ;({ error } = await supabase.from('transactions').insert(op.payload))
        } else if (op.type === 'edit') {
          ;({ error } = await supabase.from('transactions').update(op.payload).eq('id', op.txId).eq('user_id', userId))
        } else if (op.type === 'delete') {
          ;({ error } = await supabase.from('transactions').delete().eq('id', op.txId).eq('user_id', userId))
        }
      } catch (err) {
        error = err
      }
      if (!error) continue
      if (isConnectivityError(error)) {
        // Connection dropped mid-flush — keep this and everything after
        // it queued, in original order, for the next attempt.
        remaining.push(op, ...queue.slice(i + 1))
        break
      }
      // Genuine rejection for just this one item — drop it, keep going.
    }

    await saveQueue(userId, remaining)
  })
}

export function useTransactions() {
  const { user } = useAuth()
  const { isOnline, isOnlineRef, notifyOffline } = useNetwork()
  const [transactions, setTransactions] = useState([])
  // Starts true (not false) so consumers that gate a once-a-day decision on
  // `!loading` (Dashboard's monthly-recap/budget-setup effects) never see a
  // "not loading, zero transactions" snapshot before the real fetch has even
  // started — that false signal let those effects run once on the empty
  // initial array, permanently stamping their once-a-day flag before real
  // data arrived. Fine for rendering: nothing here gates a spinner on this.
  const [loading, setLoading] = useState(true)

  // Read inside `refresh` without making it depend on `transactions` (which
  // would break its referential stability for memo'd consumers like
  // AddModal) — needed so a merge can prefer "whatever's in state right
  // now" for still-pending rows over what the server just returned.
  const transactionsRef = useRef(transactions)
  useEffect(() => { transactionsRef.current = transactions }, [transactions])

  // Mount, screen-focus, and "just came back online" can all trigger a
  // refresh within moments of each other. Without sharing one in-flight
  // call, two overlapping flushQueue() runs could both read the same
  // queued item before either finishes and submit it twice.
  const refreshInFlightRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!user) { setTransactions([]); return }
    if (refreshInFlightRef.current) return refreshInFlightRef.current

    const run = (async () => {
      setLoading(true)
      try {
        if (!isOnlineRef.current) {
          // Nothing reachable — whatever's already in state/cache (including
          // any pending local edits) is the best we can show right now.
          return
        }
        await flushQueue(user.id)
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
        if (!error && data) {
          const serverTxs = data.map(fromRow)
          const queue = await loadQueue(user.id)
          const merged = mergeWithPending(serverTxs, transactionsRef.current, queue)
          setTransactions(merged)
          saveCache(user.id, merged)
        }
        // On error (offline), keep showing cached data silently
      } finally {
        setLoading(false)
        refreshInFlightRef.current = null
      }
    })()

    refreshInFlightRef.current = run
    return run
  }, [user])

  useEffect(() => {
    if (!user) { setTransactions([]); return }

    let cancelled = false
    // Show cached data as soon as it loads, while the network fetch runs
    loadCache(user.id).then(cached => {
      if (cached && !cancelled) setTransactions(cached)
    })

    refresh()
    return () => { cancelled = true }
  }, [user])

  // Coming back online specifically — not just "isOnline is true", which
  // would also fire on a normal mount that happens to already be online,
  // duplicating the mount effect's own refresh() above — kicks off a
  // refresh (which flushes the queue first) so a pending add/edit/delete
  // doesn't just sit there until the screen happens to refocus.
  const wasOnlineRef = useRef(isOnline)
  useEffect(() => {
    const wasOffline = !wasOnlineRef.current
    wasOnlineRef.current = isOnline
    if (user && wasOffline && isOnline) refresh()
  }, [user, isOnline, refresh])

  const addTransaction = useCallback(async ({ type, amount, date, description }) => {
    if (!user) return { success: false, error: 'Not signed in' }

    // Client-generated up front (not left to the DB default) so the same
    // id is used whether this syncs immediately or sits queued for a
    // while — a later offline edit/delete needs a stable id to target.
    const id = Crypto.randomUUID()
    const optimistic = {
      id,
      type,
      amount:      parseFloat(amount),
      date,
      description: description.trim(),
      createdAt:   new Date().toISOString(),
      _pending:    true,
    }

    setTransactions(prev => {
      const updated = [optimistic, ...prev]
      saveCache(user.id, updated)
      return updated
    })
    hapticAdded()

    const payload = {
      id,
      user_id:     user.id,
      type,
      amount:      parseFloat(amount),
      date,
      description: description.trim(),
    }

    if (!isOnlineRef.current) {
      await enqueue(user.id, { type: 'add', txId: id, payload })
      return { success: true, queued: true }
    }

    try {
      const { data, error } = await supabase.from('transactions').insert(payload).select().single()
      if (error) {
        // A real rejection, not connectivity — retrying later won't help,
        // so roll the optimistic entry back out and surface it.
        setTransactions(prev => {
          const updated = prev.filter(tx => tx.id !== id)
          saveCache(user.id, updated)
          return updated
        })
        return { success: false, error: error.message }
      }
      setTransactions(prev => {
        const updated = prev.map(tx => tx.id === id ? fromRow(data) : tx)
        saveCache(user.id, updated)
        return updated
      })
      return { success: true }
    } catch (err) {
      if (isConnectivityError(err, isOnlineRef.current)) {
        // Thrown, not returned-with-error — a genuine network failure mid
        // attempt. Keep the optimistic entry showing and queue it instead
        // of discarding what the user just typed.
        await enqueue(user.id, { type: 'add', txId: id, payload })
        return { success: true, queued: true }
      }
      // Not connectivity — an unexpected error that would just fail the
      // same way on retry. Roll back rather than silently queueing
      // something doomed to fail every future sync attempt too.
      setTransactions(prev => {
        const updated = prev.filter(tx => tx.id !== id)
        saveCache(user.id, updated)
        return updated
      })
      return { success: false, error: err.message || 'Something went wrong. Please try again.' }
    }
  }, [user])

  const editTransaction = useCallback(async (id, { type, amount, date, description }) => {
    if (!user) return { success: false, error: 'Not signed in' }

    const payload = { type, amount: parseFloat(amount), date, description: description.trim() }

    setTransactions(prev => {
      const updated = prev.map(tx => tx.id === id ? { ...tx, ...payload, _pending: true } : tx)
      saveCache(user.id, updated)
      return updated
    })

    if (!isOnlineRef.current) {
      await enqueue(user.id, { type: 'edit', txId: id, payload })
      return { success: true, queued: true }
    }

    try {
      const { error } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        // Real rejection — resync from the server to undo the optimistic
        // edit, since there's no separate "previous values" snapshot kept
        // to roll back to locally.
        await refresh()
        return { success: false, error: error.message }
      }
      setTransactions(prev => {
        const updated = prev.map(tx => tx.id === id ? { ...tx, _pending: false } : tx)
        saveCache(user.id, updated)
        return updated
      })
      return { success: true }
    } catch (err) {
      if (isConnectivityError(err, isOnlineRef.current)) {
        await enqueue(user.id, { type: 'edit', txId: id, payload })
        return { success: true, queued: true }
      }
      // Not connectivity — resync rather than leaving an edit applied
      // locally that's doomed to keep failing on retry.
      await refresh()
      return { success: false, error: err.message || 'Something went wrong. Please try again.' }
    }
  }, [user, refresh])

  const deleteTransaction = useCallback(async (id) => {
    if (!user) return

    setTransactions(prev => {
      const updated = prev.filter(tx => tx.id !== id)
      saveCache(user.id, updated)
      return updated
    })
    hapticDeleted()

    if (!isOnlineRef.current) {
      await enqueue(user.id, { type: 'delete', txId: id })
      return
    }

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        // Real rejection — resync to bring the row back if it's still
        // actually there server-side.
        await refresh()
      }
    } catch (err) {
      if (isConnectivityError(err, isOnlineRef.current)) {
        await enqueue(user.id, { type: 'delete', txId: id })
      } else {
        // Not connectivity — resync rather than leaving the row hidden
        // locally when the delete never actually went through.
        await refresh()
      }
    }
  }, [user, refresh])

  // Bulk-inserts already-validated {type, amount, date, description} rows
  // (see utils/exportImport.js) in chunks, rather than looping addTransaction
  // one row/network-round-trip at a time — a real import can be hundreds of
  // rows. Deliberately NOT offline-queued like the single-row mutations
  // above — imports are a rare, explicitly-triggered action someone does
  // at their desk, not something worth the complexity of chunked queueing.
  const importTransactions = useCallback(async (rows, onProgress) => {
    if (!user) return { success: false, error: 'Not signed in', imported: 0 }
    if (!rows.length) return { success: true, imported: 0 }
    if (!isOnlineRef.current) { notifyOffline(); return { success: false, offline: true, imported: 0 } }

    const payload = rows.map(r => ({
      user_id:     user.id,
      type:        r.type,
      amount:      r.amount,
      date:        r.date,
      description: r.description,
    }))

    const CHUNK_SIZE = 500
    let imported = 0
    try {
      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE)
        const { error } = await supabase.from('transactions').insert(chunk)
        if (error) return { success: false, error: error.message, imported }
        imported += chunk.length
        // Lets the UI show real per-chunk progress rather than a single
        // opaque jump from 0 to 100 — most imports are one chunk, but a
        // large one (multi-thousand rows) now visibly advances as it goes.
        if (onProgress) onProgress(imported, payload.length)
      }
    } catch (err) {
      // Import isn't offline-queued (see comment above) — a connectivity
      // drop mid-import is treated the same as never having started.
      if (isConnectivityError(err, isOnlineRef.current)) {
        notifyOffline()
        return { success: false, offline: true, imported }
      }
      return { success: false, error: err.message || 'Something went wrong. Please try again.', imported }
    }

    await refresh()
    hapticAdded()
    return { success: true, imported }
  }, [user, refresh])

  return { transactions, loading, addTransaction, editTransaction, deleteTransaction, importTransactions, refresh }
}
