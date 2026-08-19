const { withAndroidManifest } = require('expo/config-plugins');

// The app owns keyboard-avoidance entirely via its own animated
// Keyboard.addListener tracking (AnimatedModal, AddModal, login/reset/forgot
// screens). Android's default "adjustResize" also resizes the window itself
// on keyboard show, so both systems compensate at once and fight each other
// (cards rendering broken/hidden behind the keyboard). "adjustNothing" turns
// off Android's automatic behavior so the app's own logic is the only thing
// moving content.
module.exports = function withAndroidSoftInputMode(config) {
  return withAndroidManifest(config, config => {
    const activities = config.modResults.manifest.application[0].activity;
    const mainActivity = activities.find(a => a.$['android:name'] === '.MainActivity');
    if (mainActivity) {
      mainActivity.$['android:windowSoftInputMode'] = 'adjustNothing';
    }
    return config;
  });
};
