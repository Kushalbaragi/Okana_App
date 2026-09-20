// Every AsyncStorage key that holds a user's own data, named in one place so the
// code that writes them and the code that clears them (see localData.js) can't
// drift apart. Each is per user, so one account's data never shows up in another's.
export const storageKeys = {
  transactions: (userId) => `okana_txs_${userId}`,
  savings: (userId) => `okana_savings_${userId}`,
  subscription: (userId) => `okana_subscription_cache_${userId}`,
  pendingBudget: (userId) => `okana_pending_budget_${userId}`,
  syncedBudget: (userId) => `okana_synced_budget_${userId}`,
  syncQueue: (userId) => `okana_sync_queue_${userId}`,
  budgetSetupShown: (userId) => `okana_budget_setup_shown_${userId}`,
};

// Every key the app owns starts with this; the ones that aren't per user (the
// onboarding flag, the dismissed-update version) never contain a user id.
export const APP_KEY_PREFIX = 'okana_';
