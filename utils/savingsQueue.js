import AsyncStorage from '@react-native-async-storage/async-storage'
import { storageKeys } from './storageKeys'
import { reportError } from './errors'

// Savings and debt changes made offline, waiting to be sent (see the ops in
// hooks/useSavings.js), oldest first. One shared copy for the whole app, not one
// per screen: several screens use useSavings at once, and separate copies would
// send the same change twice or save over each other's. Mirrored to storage on
// every change, so a change survives the app being closed.
let state = { userId: null, ops: [], ready: Promise.resolve() }
let flushing = null

async function persist(userId) {
  try { await AsyncStorage.setItem(storageKeys.savingsQueue(userId), JSON.stringify(state.ops)) } catch (err) { reportError(err) }
}

// Loads the queue for `userId` once; later calls wait on that same load.
export function loadSavingsQueue(userId) {
  if (state.userId !== userId) {
    const next = { userId, ops: [], ready: null }
    next.ready = AsyncStorage.getItem(storageKeys.savingsQueue(userId))
      .then(raw => { if (raw) next.ops = JSON.parse(raw) })
      .catch(reportError)
    state = next
  }
  return state.ready
}

export const pendingOps = () => state.ops

export async function pushOp(userId, op) {
  await loadSavingsQueue(userId)
  state.ops = [...state.ops, op]
  await persist(userId)
}

export async function dropFirstOp(userId) {
  state.ops = state.ops.slice(1)
  await persist(userId)
}

// After an erase or a deleted account (storage is cleared by localData.js).
export function forgetSavingsQueue(userId) {
  if (state.userId === userId) state.ops = []
}

// One send at a time across the whole app; a second caller waits on the first.
export function sendExclusively(run) {
  if (!flushing) flushing = run().finally(() => { flushing = null })
  return flushing
}
