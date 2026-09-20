import { useCallback, useEffect, useRef, useState } from 'react'
import { nextAmountValue } from '../components/NumericKeypad'

// The amount-entry plumbing every keypad screen shares (Add Transaction, Budget
// setup, the savings sheets): what has been typed, which digits are new so only a
// freshly typed one plays its entrance, and a stable key handler for the memo'd
// keypad. `initial` is the value it starts with.
//
// `setProgrammatic` is for a value that arrives some way other than typing —
// opening in edit mode, resetting, a ruler — whose digits should just appear
// instead of playing the per-keystroke entrance.
export function useAmountEntry(initial = '') {
  const [amount, setAmount] = useState(initial)

  // Length as of the previous render, so a freshly typed trailing digit can be
  // told apart from ones already there — read during render (still the prior
  // value), written after every render for the next one to see.
  const prevLengthRef = useRef(0)
  const prevAmountLength = prevLengthRef.current
  useEffect(() => { prevLengthRef.current = amount.length })

  const skipDigitAnimRef = useRef(true)

  // NumericKeypad is memo()-wrapped and re-renders whenever the screen does, so
  // an inline onKeyPress would hand it a new function each time and defeat that.
  // The ref keeps the latest `amount` reachable without the handler itself ever
  // changing identity.
  const keyPressRef = useRef()
  keyPressRef.current = (key) => {
    const next = nextAmountValue(amount, key)
    if (next !== amount) {
      skipDigitAnimRef.current = false
      setAmount(next)
    }
  }
  const onKeyPress = useCallback((key) => keyPressRef.current(key), [])

  const setProgrammatic = useCallback((value) => {
    skipDigitAnimRef.current = true
    setAmount(value)
  }, [])

  return { amount, prevAmountLength, skipDigitAnim: skipDigitAnimRef.current, onKeyPress, setProgrammatic }
}
