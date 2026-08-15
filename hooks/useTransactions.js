import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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

  async function refresh() {
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
  }

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

  async function addTransaction({ type, amount, date, description }) {
    if (!user) return

    const optimistic = {
      id:          Crypto.randomUUID(),
      type,
      amount:      parseFloat(amount),
      date,
      description: description.trim(),
      createdAt:   new Date().toISOString(),
      _pending:    true,
    }

    const next = [optimistic, ...transactions]
    setTransactions(next)

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
    } else {
      setTransactions(prev => {
        const updated = prev.map(tx => tx.id === optimistic.id ? fromRow(data) : tx)
        saveCache(user.id, updated)
        return updated
      })
    }
  }

  async function editTransaction(id, { type, amount, date, description }) {
    if (!user) return

    setTransactions(prev => {
      const updated = prev.map(tx =>
        tx.id === id
          ? { ...tx, type, amount: parseFloat(amount), date, description: description.trim() }
          : tx
      )
      saveCache(user.id, updated)
      return updated
    })

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
    }
  }

  async function deleteTransaction(id) {
    if (!user) return

    setTransactions(prev => {
      const updated = prev.filter(tx => tx.id !== id)
      saveCache(user.id, updated)
      return updated
    })

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
  }

  return { transactions, loading, addTransaction, editTransaction, deleteTransaction, refresh }
}
