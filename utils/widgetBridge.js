import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ExtensionStorage } from '@bacons/apple-targets'
import { reportError } from './errors'

// Hands the widget snapshot (see widgetSnapshot.js) to the home screen widgets.
// The two platforms get it differently:
//   iOS      written to the app group both the app and the widget extension can read
//            (through @bacons/apple-targets), then WidgetKit is asked to redraw.
//   Android  it is saved to AsyncStorage, where the JS-drawn widgets read it, and the
//            widgets on the home screen are redrawn.
// Best-effort: a widget that fails to update must never affect the app.
const KEY = 'okana_widget_snapshot'
// Must match ios.entitlements in app.json and targets/widget/Snapshot.swift.
const APP_GROUP = 'group.com.kushalbaragi.okana'

let lastPushed = null

export async function pushWidgetSnapshot(snapshot) {
  const json = JSON.stringify(snapshot)
  // The app rebuilds the snapshot on every change to its data; most of them
  // don't change what the widgets show.
  if (json === lastPushed) return
  lastPushed = json

  try {
    if (Platform.OS === 'ios') {
      new ExtensionStorage(APP_GROUP).set(KEY, json)
      ExtensionStorage.reloadWidget()
    } else if (Platform.OS === 'android') {
      await AsyncStorage.setItem(KEY, json)
      // Lazy, so iOS and web never load the Android widget library or its components.
      const { refreshAndroidWidgets } = require('../widgets/android/widgetTaskHandler')
      await refreshAndroidWidgets()
    }
  } catch (err) {
    lastPushed = null
    reportError(err)
  }
}
