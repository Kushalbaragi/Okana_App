import { useCallback, useRef } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { TrashIcon } from './icons';

// The strip a swiped-open card reveals on its right: a small red circle holding
// a trash can, the same one the transaction rows show.
const ACTION_WIDTH = 68;
const DELETE_SIZE = 31;
// Keeps the actual tap target at ~45px even though the circle is drawn at 31,
// as the thumb is still coming off the swipe.
const DELETE_HIT_SLOP = 7;
// iOS systemRed as it renders in dark mode.
const DELETE_RED = '#FF453A';

// Fades and scales in as the card is dragged open, rather than sitting under it
// fully drawn the whole time. `drag` is the swipeable's own drag value.
export function SwipeDeleteAction({ drag, onDelete, label }) {
  const style = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, -drag.value / ACTION_WIDTH));
    return { opacity: progress, transform: [{ scale: 0.7 + progress * 0.3 }] };
  });

  return (
    <View style={{ width: ACTION_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={style}>
        <Pressable
          onPress={onDelete}
          hitSlop={DELETE_HIT_SLOP}
          style={{ width: DELETE_SIZE, height: DELETE_SIZE, borderRadius: DELETE_SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: DELETE_RED }}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <TrashIcon size={14} color="#ffffff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

// One swipeable row's side of it. `handleDelete` is what the revealed button
// does: the row slides shut and `onDelete(id)` is asked for at once — that
// opens a confirmation, and making it wait for the slide to finish just made it
// feel slow. `setSwipeableRef` goes on the swipeable's `ref`, which also lets a
// group (useSwipeGroup) close it.
export function useSwipeDelete(id, onDelete, registerSwipeable) {
  const swipeableRef = useRef(null);
  const setSwipeableRef = useCallback((r) => {
    swipeableRef.current = r;
    registerSwipeable?.(id, r);
  }, [id, registerSwipeable]);
  const handleDelete = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(id);
  }, [id, onDelete]);
  return { setSwipeableRef, handleDelete };
}

// Keeps a list of swipeable rows to one open at a time. Refs, not state, since
// none of this should re-render the list. Hand `registerSwipeable`, `onSwipeOpen`
// and `onRowPress` to each row; call `closeOpen` when the list starts to scroll.
// `onRowPress` returns true when it closed an open row, and a tap that did is
// spent on that — the row shouldn't also do whatever a tap on it normally does.
export function useSwipeGroup() {
  const rows = useRef(new Map());
  const openId = useRef(null);
  const registerSwipeable = useCallback((id, ref) => {
    if (ref) rows.current.set(id, ref);
    else rows.current.delete(id);
  }, []);
  const closeOpen = useCallback(() => {
    const id = openId.current;
    openId.current = null;
    if (id) rows.current.get(id)?.close();
  }, []);
  const onSwipeOpen = useCallback((id) => {
    const prev = openId.current;
    if (prev && prev !== id) rows.current.get(prev)?.close();
    openId.current = id;
  }, []);
  const onRowPress = useCallback(() => {
    if (!openId.current) return false;
    closeOpen();
    return true;
  }, [closeOpen]);
  return { registerSwipeable, onSwipeOpen, onRowPress, closeOpen };
}
