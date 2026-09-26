import { Easing, LinearTransition } from 'react-native-reanimated';

// The app's one settle curve: fast off the mark, then a long, gentle slow-down
// (an ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)). Everything that opens, slides
// in or grows uses it, so the whole app decelerates the same way.
export const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

// Three spring "personalities," shared by every animated value in the app —
// each file used to tune its own damping/stiffness/mass in isolation, which
// meant near-identical motions (a pill sliding, a digit changing) quietly
// disagreed with each other. Picking from this fixed set instead is what
// makes the whole app read as one consistent feel rather than a pile of
// separately-tuned animations that each look fine alone.
//
// Quick — a control settling into a new value with no perceptible overshoot:
// amount digits changing, a segmented pill sliding to its new position.
export const SPRING_QUICK = { damping: 18, stiffness: 220, mass: 0.5 };
// Smooth — heavier content reflowing (rows pushing up/down as the list
// changes) — calmer and very slightly slower so it doesn't feel jumpy.
export const SPRING_SMOOTH = { damping: 22, stiffness: 180, mass: 0.6 };
// Bouncy — tactile press feedback (scale down/up on tap) — lower damping
// relative to stiffness gives it a touch of springy overshoot, which is
// what makes a press feel "alive" rather than just a linear resize.
export const SPRING_BOUNCY = { damping: 12, stiffness: 220, mass: 1 };

// Builds a `layout` transition from one of the presets above, so a
// LinearTransition and a plain withSpring animating the same kind of thing
// (e.g. SPRING_QUICK for both a digit's own scale and its layout shift)
// always move in lockstep.
export function layoutTransition(preset) {
  return LinearTransition.springify().damping(preset.damping).stiffness(preset.stiffness).mass(preset.mass);
}
