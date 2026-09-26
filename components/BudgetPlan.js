import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Keyboard } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GlassPressable, INPUT_TEXT_STYLE } from './Glass';
import { SwipeDeleteAction, useSwipeDelete, useSwipeGroup } from './SwipeDeleteAction';
import AmountEntrySheet from './AmountEntrySheet';
import { BUDGET_SCALE } from './AmountRuler';
import { dim, money } from './savingsShared';
import { CheckIcon, PlusIcon } from './icons';
import { textColor } from '../utils/colors';

// No card surface here — the plan sits directly on the page, same
// background as the rest of it (see SpendCalendarModal's own page style),
// so a swiped-open row still needs an opaque backing (or the delete button
// underneath would show through as it slides) but reads as part of the page
// rather than a separate surface.
const rowBg = (light) => (light ? '#FAFAF8' : '#000000');

// This is the space the calendar's Budget section used to give a heatmap
// (see SpendCalendarModal's own comment on that being cut) — now a plan for
// where next month's money is going, written before the salary that pays for
// it lands. Deliberately just a running note: a line and an amount, nothing
// linked to a category — see useBudgetPlan.js's own comment on why.
//
// Checking a line off turns it into a real expense on today's date (see
// useBudgetPlan's setChecked) — the reminder this was asked for: plan it now,
// tick it off when it's actually paid, and it lands in the ledger on its own.
const ROW_PAD = { paddingHorizontal: 16, paddingVertical: 12 };

function Checkbox({ checked, onPress, light }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={checked ? 'Mark as not paid' : 'Mark as paid'}>
      <View
        style={{
          width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
          borderWidth: checked ? 0 : 1.5,
          borderColor: dim(light, 0.25),
          backgroundColor: checked ? '#4ade80' : 'transparent',
        }}
      >
        {checked && <CheckIcon size={13} color="#0a0a0a" />}
      </View>
    </Pressable>
  );
}

// One line of the plan: a checkbox, a name and an amount. The name is set
// once, from the Plan popup, and stays plain text here — no inline "What
// for" box any more, so there's only one place a line's name is ever typed.
// The amount can still be adjusted in place, saved on blur. Checked, both
// turn into plain (dimmer) text — the line is now a real expense elsewhere,
// so editing it here would just drift out of sync with that. Swiping it
// left still deletes it either way, taking its expense with it if it has one.
const ItemRow = memo(function ItemRow({ item, onChangeAmount, onDelete, onToggleChecked, registerSwipeable, onSwipeOpen, light }) {
  const { setSwipeableRef, handleDelete } = useSwipeDelete(item.id, onDelete, registerSwipeable);
  const [amountText, setAmountText] = useState(item.amount ? String(item.amount) : '');
  useEffect(() => setAmountText(item.amount ? String(item.amount) : ''), [item.amount]);
  const checked = !!item.checkedAt;

  return (
    <ReanimatedSwipeable
      ref={setSwipeableRef}
      friction={1.8}
      rightThreshold={32}
      overshootRight={false}
      renderRightActions={(_progress, drag) => <SwipeDeleteAction drag={drag} onDelete={handleDelete} label="Delete line" />}
      onSwipeableWillOpen={() => onSwipeOpen?.(item.id)}
    >
      <View style={[ROW_PAD, { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: rowBg(light) }]}>
        <Checkbox checked={checked} onPress={() => onToggleChecked(item.id, !checked)} light={light} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: checked ? dim(light, 0.4) : (light ? '#111111' : '#ffffff') }}>
          {item.name || 'Untitled'}
        </Text>
        {checked ? (
          <Text style={{ fontSize: 15, color: dim(light, 0.4) }}>{money(item.amount)}</Text>
        ) : (
          <TextInput
            value={amountText}
            onChangeText={t => setAmountText(t.replace(/[^0-9]/g, ''))}
            onEndEditing={() => { const v = amountText ? parseFloat(amountText) : 0; if (v !== item.amount) onChangeAmount(v); }}
            placeholder="0"
            placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
            keyboardType="number-pad"
            maxLength={9}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            style={[INPUT_TEXT_STYLE, { width: 90, textAlign: 'right', fontSize: 15, color: light ? '#111111' : '#ffffff', paddingVertical: 0 }]}
          />
        )}
      </View>
    </ReanimatedSwipeable>
  );
});

function BudgetPlan({ plan, onAddPress, onItemChecked, light = false }) {
  const { items, total, updateItem, deleteItem, setChecked } = plan;
  const swipes = useSwipeGroup();

  // Only tells the caller (for its toast) once the write actually went
  // through — a failed/offline toggle stays silent rather than confirming
  // something that didn't happen. The name goes with it so the toast can
  // say what it was, not just that something happened.
  const handleToggleChecked = useCallback(async (id, checked) => {
    const result = await setChecked(id, checked);
    if (result?.success) {
      const item = items.find(i => i.id === id);
      onItemChecked?.(checked, item?.name || 'Expense');
    }
  }, [setChecked, onItemChecked, items]);

  return (
    <View>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 19, fontWeight: '600', letterSpacing: -0.3, color: light ? '#111111' : '#ffffff' }}>
          Plan your next salary
        </Text>
        <GlassPressable
          variant="field"
          radius={9999}
          onPress={onAddPress}
          accessibilityRole="button"
          accessibilityLabel="Plan an expense"
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dim(light, 0.14) }}
        >
          <PlusIcon size={16} color={light ? '#111111' : '#ffffff'} />
        </GlassPressable>
      </View>

      {items.length === 0 && (
        <Text style={{ paddingVertical: 16, fontSize: 14, color: textColor(light).tertiary }}>Nothing planned yet.</Text>
      )}
      {items.map(item => (
        <ItemRow
          key={item.id}
          item={item}
          onChangeAmount={amount => updateItem(item.id, { amount })}
          onDelete={deleteItem}
          onToggleChecked={handleToggleChecked}
          registerSwipeable={swipes.registerSwipeable}
          onSwipeOpen={swipes.onSwipeOpen}
          light={light}
        />
      ))}
      <View style={[ROW_PAD, { flexDirection: 'row', justifyContent: 'flex-end' }]}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: light ? '#111111' : '#ffffff' }}>{money(total)}</Text>
      </View>
    </View>
  );
}

// The one popup this feature needs: a name and an amount, nothing else —
// same minimal ask as the plan itself. Rendered as a sibling of the page
// (see SpendCalendarModal), same as the savings/debt sheets, so it slides up
// over everything including the header. Built on the same shared sheet
// those use — see AmountEntrySheet.js.
// Starting point for the amount ruler — a drag away either direction, not
// zero (which would give the ruler nothing to feel out from).
const DEFAULT_AMOUNT = 2000;

export function AddBudgetItemSheet({ open, onClose, onClosed, onSubmit, suggestions = [], light = false }) {
  return (
    <AmountEntrySheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      light={light}
      heightRatio={0.62}
      title="Add your plan"
      nameLabel="For"
      namePlaceholder="What for"
      nameSuggestions={suggestions}
      initialAmount={DEFAULT_AMOUNT}
      scale={BUDGET_SCALE}
      minAmount={1}
      submitLabel="Add"
      onSubmit={onSubmit}
    />
  );
}

export default memo(BudgetPlan);
