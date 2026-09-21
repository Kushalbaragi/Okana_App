import AsyncStorage from '@react-native-async-storage/async-storage'
import { requestWidgetUpdate } from 'react-native-android-widget'
import { resolveWidgetSnapshot } from '../../utils/widgetSnapshot'
import { WIDGETS } from './OkanaWidgets'

// Where the app leaves the snapshot for the widgets. Not a per-user key on
// purpose: it holds only the current account's snapshot and is overwritten with a
// signed-out one on logout (see useWidgetSync).
export const WIDGET_SNAPSHOT_KEY = 'okana_widget_snapshot'

async function readSnapshot() {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function render(widgetName, info) {
  const Widget = WIDGETS[widgetName]
  if (!Widget) return null
  const snap = resolveWidgetSnapshot(await readSnapshot())
  return <Widget snap={snap} info={info} />
}

// Called by Android whenever a widget is added, resized, or due a refresh
// (the periodic one is what rolls the day over while the app is closed).
export async function widgetTaskHandler(props) {
  const { widgetAction, widgetInfo, renderWidget } = props
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return
  const element = await render(widgetInfo.widgetName, widgetInfo)
  if (element) renderWidget(element)
}

// Redraws every widget on the home screen from the stored snapshot. The app
// calls this after it writes one.
export async function refreshAndroidWidgets() {
  await Promise.all(Object.keys(WIDGETS).map(widgetName =>
    requestWidgetUpdate({ widgetName, renderWidget: (info) => render(widgetName, info) }),
  ))
}
