import * as SplashScreen from 'expo-splash-screen'

// The native splash (black, with the logo — see the expo-splash-screen entry in
// app.json) stays up until the first real screen is ready to be seen, instead of
// vanishing the moment React Native mounts anything. Before this, the splash was
// the template's blank white one and went away at the first frame, so a launch
// read as: blank, then a black spinner, then a slow fade-in.
//
// Held from module load (this file is imported by the root layout), released by
// hideSplash(): once the home screen has its first data, or once the session
// check says the user is going to a sign-in screen. FAILSAFE_MS is the backstop —
// a splash that never leaves is far worse than one that leaves early.
const FAILSAFE_MS = 8000

let hidden = false

SplashScreen.setOptions({ fade: true, duration: 250 })
SplashScreen.preventAutoHideAsync().catch(() => {})
setTimeout(() => hideSplash(), FAILSAFE_MS)

export function hideSplash() {
  if (hidden) return
  hidden = true
  SplashScreen.hideAsync().catch(() => {})
}
