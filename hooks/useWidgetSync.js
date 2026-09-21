import { useEffect } from 'react'
import { AppState } from 'react-native'
import { buildWidgetSnapshot } from '../utils/widgetSnapshot'
import { pushWidgetSnapshot } from '../utils/widgetBridge'

// Keeps the home screen widgets in step with what the dashboard is showing.
// Pushes whenever the data changes, and again when the app leaves the
// foreground — which is when a widget is about to be looked at, and covers a day
// that rolled over while the app was open. (Signed out is handled in
// AuthContext, since this screen is gone by then.)
export function useWidgetSync({ transactions, budget, goals }) {
  const spent = budget.spentThisMonth
  const budgetAmount = budget.amount

  useEffect(() => {
    const push = () => pushWidgetSnapshot(buildWidgetSnapshot({ transactions, spent, budget: budgetAmount, goals }))
    push()
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') push() })
    return () => sub.remove()
  }, [transactions, spent, budgetAmount, goals])
}
