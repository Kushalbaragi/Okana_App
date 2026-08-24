import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { currentMonthYear, getMonthTotal } from '../utils/format'
import { prevMonthYear } from '../utils/monthlyRecap'
import { scheduleForNextMorning } from '../utils/notifications'

function monthStartStr(month, year) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

export function useBudget(user, transactions) {
  const { month, year } = currentMonthYear()
  const monthStart = monthStartStr(month, year)
  const { month: prevMonth, year: prevYear } = prevMonthYear(month, year)
  const prevMonthStart = monthStartStr(prevMonth, prevYear)

  const [budgetRow, setBudgetRow] = useState(null)
  const [lastMonthAmount, setLastMonthAmount] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) { setBudgetRow(null); setLastMonthAmount(null); setLoading(false); return }
    setLoading(true)
    try {
      const { data } = await supabase
        .from('monthly_budgets')
        .select('*')
        .eq('user_id', user.id)
        .in('month_start', [monthStart, prevMonthStart])
      const current = data?.find(row => row.month_start === monthStart)
      const last = data?.find(row => row.month_start === prevMonthStart)
      setBudgetRow(current || null)
      setLastMonthAmount(last?.budget_amount ?? null)
    } catch {
      // Best-effort — a failed fetch just leaves the previous budget state
      // in place rather than crashing or hanging on "loading" forever.
    } finally {
      setLoading(false)
    }
  }, [user, monthStart, prevMonthStart])

  useEffect(() => { refresh() }, [refresh])

  const setBudget = useCallback(async (amountNumber) => {
    if (!user) return { success: false, error: 'Not signed in' }
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
      setBudgetRow(data)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message || 'Network error. Please try again.' }
    }
  }, [user, monthStart])

  const spentThisMonth = useMemo(
    () => getMonthTotal(transactions, 'expense', month, year),
    [transactions, month, year],
  )

  const lastMonthSpent = useMemo(
    () => getMonthTotal(transactions, 'expense', prevMonth, prevYear),
    [transactions, prevMonth, prevYear],
  )

  const percent = budgetRow ? Math.round((spentThisMonth / budgetRow.budget_amount) * 100) : null

  // Fires at most once per threshold per month — the optimistic local flip
  // (before awaiting the notification/DB write) stops this effect from
  // re-scheduling on the next re-render while the write is in flight.
  // Reset-per-month is automatic since each calendar month is its own row.
  useEffect(() => {
    if (!user || loading || !budgetRow) return
    const pct = (spentThisMonth / budgetRow.budget_amount) * 100

    ;(async () => {
      try {
        if (pct >= 90 && !budgetRow.notified_90) {
          setBudgetRow(prev => (prev ? { ...prev, notified_90: true } : prev))
          await scheduleForNextMorning({ body: "You've used 90% of your monthly budget." })
          await supabase.from('monthly_budgets').update({ notified_90: true }).eq('id', budgetRow.id)
        }
        if (pct >= 100 && !budgetRow.notified_100) {
          setBudgetRow(prev => (prev ? { ...prev, notified_100: true } : prev))
          await scheduleForNextMorning({ body: "You've exceeded your monthly budget." })
          await supabase.from('monthly_budgets').update({ notified_100: true }).eq('id', budgetRow.id)
        }
      } catch {
        // Best-effort notification — a failed schedule/write just means this
        // threshold's alert is silently missed for the month rather than
        // crashing the budget hook.
      }
    })()
  }, [user, loading, budgetRow, spentThisMonth])

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
