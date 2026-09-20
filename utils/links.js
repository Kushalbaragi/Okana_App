import { Linking, Platform } from 'react-native';
import { reportError } from './errors';

// Opens a URL in whatever handles it, and says whether that worked. A failure is
// reported and returned, never thrown: opening a link is a tap in a menu, and
// nothing in the app should crash or hang on a device that can't open one. Pass
// `report: false` for an attempt that is expected to fail on some devices (a
// store deep link with a web address to fall back to).
export async function openLink(url, { report = true } = {}) {
  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    if (report) reportError(err);
    return false;
  }
}

const IOS_APP_ID = '6805307127';
const ANDROID_PACKAGE = 'com.kushalbaragi.okana';

// Opens Okana's page in the store. itms-apps:// (iOS) and market:// (Android)
// open the native store app directly; the plain https listing is the fallback for
// a device where the store app can't take the custom scheme (Play Store missing on
// some Android builds and emulators). `review` goes straight to the screen for
// writing a review rather than the listing.
export async function openStoreListing({ review = false } = {}) {
  const storeUrl = Platform.OS === 'ios'
    ? `itms-apps://apps.apple.com/app/id${IOS_APP_ID}${review ? '?action=write-review' : ''}`
    : `market://details?id=${ANDROID_PACKAGE}${review ? '&showAllReviews=true' : ''}`;
  const webUrl = Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${IOS_APP_ID}`
    : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  if (!(await openLink(storeUrl, { report: false }))) await openLink(webUrl);
}
