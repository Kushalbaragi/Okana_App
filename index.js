import 'expo-router/entry'
import { Platform } from 'react-native'

// Android widgets are drawn by JS, and Android starts the app in the background
// to do it, so the handler has to be registered here, at the entry point, rather
// than in a screen. iOS widgets are native and need nothing at startup.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget')
  const { widgetTaskHandler } = require('./widgets/android/widgetTaskHandler')
  registerWidgetTaskHandler(widgetTaskHandler)
}
