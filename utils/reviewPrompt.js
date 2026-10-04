import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportError } from './errors';

// Asking for a store rating, kept deliberately rare. The system sheet
// (StoreReview.requestReview) is the only way to ask: it shows the stars and
// lets the person write a review without leaving the app, but the store decides
// whether it actually appears — Apple shows it at most three times a year per
// person — and the app is never told what was entered. So this only decides
// whether the app is WILLING to ask: at most `maxAsks` times in all, and never
// within MIN_GAP_DAYS of the last time.
const MAX_ASKS = 3;
const MIN_GAP_DAYS = 90;
const DAY_MS = 86400000;

// Loaded on first use, not at the top of the file: expo-store-review is a native
// module, and importing it in an app binary built before it was added throws
// ("Cannot find native module") the moment this file is evaluated — which is on
// launch. Asked for lazily and inside a try, a build without it just never asks.
let storeReview;
function getStoreReview() {
  if (storeReview === undefined) {
    try {
      storeReview = require('expo-store-review');
    } catch {
      storeReview = null;
    }
  }
  return storeReview;
}

const stateKey = (userId) => `okana_review_prompt_${userId}`;

async function readState(userId) {
  try {
    const raw = await AsyncStorage.getItem(stateKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return { asks: parsed?.asks || 0, lastAskAt: parsed?.lastAskAt || 0 };
  } catch {
    return { asks: 0, lastAskAt: 0 };
  }
}

// Asks for a rating if the rules allow it. `maxAsks` lets a caller be stricter
// than the overall cap (the first-month prompt passes 1, so it only ever fires
// once). Resolves to whether the system sheet was requested; never throws —
// a rating prompt is not worth breaking anything for.
export async function askForReviewIfDue(userId, { maxAsks = MAX_ASKS } = {}) {
  if (!userId) return false;
  try {
    const StoreReview = getStoreReview();
    if (!StoreReview || !(await StoreReview.hasAction())) return false;
    const { asks, lastAskAt } = await readState(userId);
    if (asks >= maxAsks) return false;
    if (lastAskAt && Date.now() - lastAskAt < MIN_GAP_DAYS * DAY_MS) return false;
    // Counted before asking, so a crash mid-prompt can't leave it free to fire again.
    await AsyncStorage.setItem(stateKey(userId), JSON.stringify({ asks: asks + 1, lastAskAt: Date.now() }));
    await StoreReview.requestReview();
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
}
