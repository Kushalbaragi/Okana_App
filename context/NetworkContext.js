import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

const NetworkContext = createContext(null);

function computeOnline(state) {
  return !!(state.isConnected && state.isInternetReachable !== false);
}

// How long the banner stays up once triggered — a fixed flash of
// feedback, not tied to how long the underlying state actually lasts.
const BANNER_DURATION_MS = 2000;

// Single shared NetInfo subscription for the whole app — exposes a
// reactive `isOnline` and a ref version (`isOnlineRef`) for code that
// needs a synchronous "are we online right now" read without subscribing
// to re-renders on every blip. Also owns the offline/online banner: there
// is no ambient "you're offline" indicator — the offline banner only
// shows when something that needed the network was actually attempted,
// via notifyOffline(). The "you're online" follow-up only shows if that
// happened at least once and hasn't been confirmed back yet — coming
// back online is not itself news if nothing ever failed because of it.
export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const isOnlineRef = useRef(true);
  const [banner, setBanner] = useState(null); // 'offline' | 'online' | null
  const bannerTimeoutRef = useRef(null);
  // True from the moment notifyOffline() fires until the matching
  // "you're online" banner has been shown — this is what makes the
  // online confirmation conditional on an offline attempt actually
  // having happened, not just any reconnect.
  const awaitingOnlineNoticeRef = useRef(false);

  const showBanner = useCallback(kind => {
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    setBanner(kind);
    bannerTimeoutRef.current = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  }, []);

  // Restarts the window on every call rather than being a no-op while
  // already visible — a second attempt gets its own full duration, not
  // whatever happened to be left on the first one.
  const notifyOffline = useCallback(() => {
    awaitingOnlineNoticeRef.current = true;
    showBanner('offline');
  }, [showBanner]);

  useEffect(() => {
    const apply = state => {
      const online = computeOnline(state);
      const wasOffline = !isOnlineRef.current;
      isOnlineRef.current = online;
      setIsOnline(online);
      if (online && wasOffline && awaitingOnlineNoticeRef.current) {
        awaitingOnlineNoticeRef.current = false;
        showBanner('online');
      }
    };
    const unsubscribe = NetInfo.addEventListener(apply);
    NetInfo.fetch().then(apply);
    return unsubscribe;
  }, [showBanner]);

  useEffect(() => () => {
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, isOnlineRef, banner, notifyOffline }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
