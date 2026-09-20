import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_KEY_PREFIX, storageKeys } from './storageKeys';
import { withQueueLock } from './syncQueue';

// What a device still holds of a user's data after it has been erased on the
// server. Left behind, it does harm: the offline queue is replayed the next time
// the app refreshes, which would put erased transactions straight back, and the
// caches would show erased data whenever the app is offline.

// Erase All Data: the account stays, its data goes. Clears the caches of
// everything that was erased, and the offline queue with them. The queue is
// cleared under its lock so a sync that is running can't write it back.
export async function clearDataCaches(userId) {
  if (!userId) return;
  await withQueueLock(userId, () => AsyncStorage.removeItem(storageKeys.syncQueue(userId)));
  await AsyncStorage.multiRemove([
    storageKeys.transactions(userId),
    storageKeys.savings(userId),
    storageKeys.syncedBudget(userId),
    storageKeys.pendingBudget(userId),
    storageKeys.budgetSetupShown(userId),
  ]);
}

// Delete Account: everything this device keeps for that user — caches, the
// queue, and the once-a-day flags — and nothing else. A user id is a UUID, so
// matching on it can't catch another user's keys or the app-wide ones.
export async function clearAllUserData(userId) {
  if (!userId) return;
  await withQueueLock(userId, async () => {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(APP_KEY_PREFIX) && k.includes(userId)));
  });
}
