import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { hapticAdded, hapticDeleted } from '../utils/haptics'

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

export function useTransactions() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)

  // Wrapped in useCallback (with functional setState updaters below, so
  // none of these need `transactions` in their own closure) so consumers
  // like AddModal — a heavy, always-in-the-tree component — get
  // referentially stable props and can actually skip re-rendering via
  // memo() when unrelated Dashboard state changes.
  const refresh = useCallback(async () => {
    if (!user) { setTransactions([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error && data) {
      const txs = data.map(fromRow)
      setTransactions(txs)
      saveCache(user.id, txs)
    }
    // On error (offline), keep showing cached data silently
    setLoading(false)
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

  const addTransaction = useCallback(async ({ type, amount, date, description }) => {
    if (!user) return { success: false, error: 'Not signed in' }

    const optimistic = {
      id:          Crypto.randomUUID(),
      type,
      amount:      parseFloat(amount),
      date,
      description: description.trim(),
      createdAt:   new Date().toISOString(),
      _pending:    true,
    }

    setTransactions(prev => [optimistic, ...prev])
    hapticAdded()

    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id:     user.id,
          type,
          amount:      parseFloat(amount),
          date,
          description: description.trim(),
        })
        .select()
        .single()

      if (error) {
        setTransactions(prev => prev.filter(tx => tx.id !== optimistic.id))
        return { success: false, error: error.message }
      }
      setTransactions(prev => {
        const updated = prev.map(tx => tx.id === optimistic.id ? fromRow(data) : tx)
        saveCache(user.id, updated)
        return updated
      })
      return { success: true }
    } catch (err) {
      setTransactions(prev => prev.filter(tx => tx.id !== optimistic.id))
      return { success: false, error: err.message || 'Network error. Please try again.' }
    }
  }, [user])

  const editTransaction = useCallback(async (id, { type, amount, date, description }) => {
    if (!user) return { success: false, error: 'Not signed in' }

    setTransactions(prev => {
      const updated = prev.map(tx =>
        tx.id === id
          ? { ...tx, type, amount: parseFloat(amount), date, description: description.trim() }
          : tx
      )
      saveCache(user.id, updated)
      return updated
    })

    try {
      const { error } = await supabase
        .from('transactions')
        .update({ type, amount: parseFloat(amount), date, description: description.trim() })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        const { data } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
        if (data) {
          const txs = data.map(fromRow)
          setTransactions(txs)
          saveCache(user.id, txs)
        }
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message || 'Network error. Please try again.' }
    }
  }, [user])

  const deleteTransaction = useCallback(async (id) => {
    if (!user) return

    setTransactions(prev => {
      const updated = prev.filter(tx => tx.id !== id)
      saveCache(user.id, updated)
      return updated
    })
    hapticDeleted()

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (data) {
        const txs = data.map(fromRow)
        setTransactions(txs)
        saveCache(user.id, txs)
      }
    }
  }, [user])

  return { transactions, loading, addTransaction, editTransaction, deleteTransaction, refresh }
}
