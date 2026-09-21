/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'OkanaWidgets',
  displayName: 'Okana',
  // containerBackground(for: .widget), which the widgets use, needs iOS 17.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  // Same app group as the app (app.json), so the widgets can read what it writes.
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
