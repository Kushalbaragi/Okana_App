import { useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { computeFacts, pickInsight, dayNumber, EMPTY_HISTORY } from '../utils/insightEngine'
import { quoteFor } from '../utils/dailyTips'
import { storageKeys } from '../utils/storageKeys'
import { reportError } from '../utils/errors'

// Today's insight, its description and quote for the Summary page, plus the facts behind it.
//
// The engine itself is pure; this hook is the only place that remembers anything. It
// keeps what it showed lately (so an insight rests after it's been seen) in
// AsyncStorage, per user, and holds back the insight until that memory has loaded:
// choosing before it has would pick without knowing what was just shown.
export function useInsight({ userId, name, transactions, budgetAmount, goals }) {
  // undefined = not loaded yet; an object once it has been read (or failed to be).
  const [history, setHistory] = useState(undefined)

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    AsyncStorage.getItem(storageKeys.insightHistory(userId))
      .then(raw => {
        if (cancelled) return
        const parsed = raw ? JSON.parse(raw) : null
        setHistory(parsed && typeof parsed === 'object' && parsed.shown ? parsed : EMPTY_HISTORY)
      })
      // A history that can't be read only means an insight may repeat sooner.
      .catch(() => { if (!cancelled) setHistory(EMPTY_HISTORY) })
    return () => { cancelled = true }
  }, [userId])

  const facts = useMemo(
    () => computeFacts({ transactions, budget: { amount: budgetAmount }, goals, name }),
    [transactions, budgetAmount, goals, name],
  )
  const day = dayNumber()

  const picked = useMemo(() => {
    if (history === undefined) return null
    return pickInsight(facts, history, day)
  }, [facts, history, day])

  // Remember what was shown. Picking again with the new memory returns the same
  // insight (it is stable within a day), so this settles after one round.
  useEffect(() => {
    if (!userId || !picked || picked.history === history) return
    setHistory(picked.history)
    AsyncStorage.setItem(storageKeys.insightHistory(userId), JSON.stringify(picked.history)).catch(reportError)
  }, [userId, picked, history])

  return {
    ready: history !== undefined,
    insight: picked?.insight ?? null,
    description: picked?.insight?.description ?? null,
    visual: picked?.insight?.visual ?? null,
    quote: picked?.insight ? quoteFor(picked.insight.quoteKey, day) : null,
    facts,
  }
}
