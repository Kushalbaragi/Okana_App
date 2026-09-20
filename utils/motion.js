import { Easing } from 'react-native-reanimated';

// The app's one settle curve: fast off the mark, then a long, gentle slow-down
// (an ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)). Everything that opens, slides
// in or grows uses it, so the whole app decelerates the same way.
export const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);
