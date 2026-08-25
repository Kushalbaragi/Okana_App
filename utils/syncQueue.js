import AsyncStorage from '@react-native-async-storage/async-storage'

const queueKey = (userId) => `okana_sync_queue_${userId}`

export async function loadQueue(userId) {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function saveQueue(userId, queue) {
  try {
    await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue))
  } catch { /* best-effort, same as the transaction cache */ }
}

// Serializes every load-modify-save cycle against a given user's queue.
// Without this, two calls close together (a rapid double delete while
// offline, or a fresh mutation landing the instant a flush starts) can
// both load the same queue before either saves, so whichever saves last
// silently clobbers the other's change — a queued mutation just vanishes,
// with no error to show for it. enqueue() and flushQueue() both go
// through this so their read-modify-write cycles never interleave.
const queueLocks = new Map() // userId -> Promise chain

export function withQueueLock(userId, fn) {
  const prev = queueLocks.get(userId) || Promise.resolve()
  const next = prev.catch(() => {}).then(fn)
  queueLocks.set(userId, next)
  return next
}

// Persists a mutation immediately, before the caller returns — if the app
// gets killed right after an offline add/edit/delete, the write survives
// to be retried on next launch instead of silently vanishing.
export async function enqueue(userId, op) {
  return withQueueLock(userId, async () => {
    const queue = await loadQueue(userId)
    queue.push(op)
    await saveQueue(userId, queue)
  })
}

// A transaction that was created AND deleted while still offline never
// synced in the first place, so neither op needs to touch the network at
// all — this drops both silently instead of doing a pointless insert
// immediately followed by a delete once back online. Multiple edits to
// the same not-yet-synced-delete-pending row collapse the same way —
// only the last one's values matter once the row's fate is "gone".
//
// Multiple *edits* to a row that's staying (no matching add+delete pair)
// also collapse to just the latest one — replaying three intermediate
// edits as three separate network round-trips when only the final values
// matter is pure waste.
export function collapseQueue(queue) {
  const deletedIds = new Set(queue.filter(op => op.type === 'delete').map(op => op.txId))
  const addedIds = new Set(queue.filter(op => op.type === 'add').map(op => op.txId))
  const droppedIds = new Set([...deletedIds].filter(id => addedIds.has(id)))

  const kept = queue.filter(op => !droppedIds.has(op.txId))

  // Keep only the last edit per id — walk backwards, first time we see an
  // edit for an id we keep it, any earlier edit for that same id is
  // superseded and dropped.
  const seenEdit = new Set()
  const result = []
  for (let i = kept.length - 1; i >= 0; i--) {
    const op = kept[i]
    if (op.type === 'edit') {
      if (seenEdit.has(op.txId)) continue
      seenEdit.add(op.txId)
    }
    result.push(op)
  }
  return result.reverse()
}

// Reconciles fresh server data with whatever's still unsynced — a plain
// server refetch would otherwise blow away local edits/adds that haven't
// made it to the backend yet (or resurrect a row that's pending delete).
// For every id still in the queue, prefer the local copy already sitting
// in React state over what the server just returned; pending adds that
// the server doesn't know about yet get appended; pending deletes get
// filtered out even though the server still has the row.
export function mergeWithPending(serverTxs, localTxs, queue) {
  if (!queue.length) return serverTxs

  const pendingIds = new Set(queue.map(op => op.txId))
  const deletedIds = new Set(queue.filter(op => op.type === 'delete').map(op => op.txId))
  const localById = new Map(localTxs.map(tx => [tx.id, tx]))

  const merged = serverTxs
    .filter(tx => !deletedIds.has(tx.id))
    .map(tx => (pendingIds.has(tx.id) && localById.has(tx.id)) ? localById.get(tx.id) : tx)

  for (const op of queue) {
    if (op.type === 'add' && !deletedIds.has(op.txId) && !merged.some(tx => tx.id === op.txId)) {
      const local = localById.get(op.txId)
      if (local) merged.push(local)
    }
  }

  return merged.sort(
    (a, b) =>
      new Date(b.date) - new Date(a.date) ||
      new Date(b.createdAt) - new Date(a.createdAt),
  )
}
