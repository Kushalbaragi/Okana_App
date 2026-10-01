import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Keyboard, StyleSheet } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { INPUT_TEXT_STYLE } from './Glass';
import { SwipeDeleteAction, useSwipeDelete, useSwipeGroup } from './SwipeDeleteAction';
import AmountEntrySheet from './AmountEntrySheet';
import { Card, cardFill, dim, money } from './savingsShared';
import { CheckIcon, PlusIcon } from './icons';
import { textColor } from '../utils/colors';
import { BODY } from '../utils/type';

// This is the space the calendar's Budget section used to give a heatmap
// (see WalletPage's own comment on that being cut) — now a plan for
// where next month's money is going, written before the salary that pays for
// it lands. Deliberately just a running note: a line and an amount, nothing
// linked to a category — see useBudgetPlan.js's own comment on why.
//
// Checking a line off turns it into a real expense on today's date (see
// useBudgetPlan's setChecked) — the reminder this was asked for: plan it now,
// tick it off when it's actually paid, and it lands in the ledger on its own.
const ROW_PAD = { paddingHorizontal: 16, paddingVertical: 13 };
const CHECKBOX_SIZE = 19;
const CHECKBOX_GAP = 10;

function Checkbox({ checked, onPress, light }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={checked ? 'Mark as not paid' : 'Mark as paid'}>
      <View
        style={{
          width: CHECKBOX_SIZE, height: CHECKBOX_SIZE, borderRadius: CHECKBOX_SIZE / 2, alignItems: 'center', justifyContent: 'center',
          borderWidth: checked ? 0 : 1.5,
          borderColor: dim(light, 0.25),
          backgroundColor: checked ? '#4ade80' : 'transparent',
        }}
      >
        {checked && <CheckIcon size={11} color="#0a0a0a" />}
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
// left still asks to delete it either way (see WalletPage's own confirm
// prompt), taking its expense with it if it has one.
const ItemRow = memo(function ItemRow({ item, onChangeAmount, onDelete, onToggleChecked, onPress, registerSwipeable, onSwipeOpen, light, isLast }) {
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
      {/* The row itself opens the edit sheet (name + amount together) —
          the checkbox and the inline amount field are their own touch
          targets underneath it, so they still take taps directly rather
          than bubbling up to this. */}
      <Pressable
        onPress={onPress}
        style={[
          ROW_PAD,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: CHECKBOX_GAP,
            backgroundColor: cardFill(light),
            borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
            borderBottomColor: dim(light, 0.08),
          },
        ]}
      >
        <Checkbox checked={checked} onPress={() => onToggleChecked(item.id, !checked)} light={light} />
        <Text numberOfLines={1} style={[BODY, { flex: 1, color: checked ? dim(light, 0.4) : (light ? '#111111' : '#ffffff') }]}>
          {item.name || 'Untitled'}
        </Text>
        {checked ? (
          <Text style={[BODY, { color: dim(light, 0.4) }]}>{money(item.amount)}</Text>
        ) : (
          <TextInput
            value={amountText ? `₹${Number(amountText).toLocaleString('en-IN')}` : ''}
            onChangeText={t => setAmountText(t.replace(/[^0-9]/g, ''))}
            onEndEditing={() => { const v = amountText ? parseFloat(amountText) : 0; if (v !== item.amount) onChangeAmount(v); }}
            placeholder="0"
            placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
            keyboardType="number-pad"
            maxLength={9}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            style={[INPUT_TEXT_STYLE, BODY, { width: 90, textAlign: 'right', color: light ? '#111111' : '#ffffff', paddingVertical: 0 }]}
          />
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
});

function BudgetPlan({ plan, onAddPress, onEditItem, onItemChecked, onRequestCheck, onRequestDeleteItem, onRequestClear, light = false }) {
  const { items, total, updateItem, setChecked } = plan;
  const swipes = useSwipeGroup();

  // Only tells the caller (for its toast) once the write actually went
  // through — a failed/offline toggle stays silent rather than confirming
  // something that didn't happen. The name goes with it so the toast can
  // say what it was, not just that something happened.
  //
  // Checking a line off used to turn it straight into an expense; now that's
  // asked about first (see WalletPage's own confirm prompt), so checking on
  // just hands the line to `onRequestCheck` instead of writing anything —
  // the actual `setChecked` call (with or without a transaction) happens
  // once that prompt is answered. Unchecking still needs no ask: it only
  // ever undoes what a confirmed check already did.
  const handleToggleChecked = useCallback(async (id, checked) => {
    const item = items.find(i => i.id === id);
    if (checked) { onRequestCheck?.(item); return; }
    const result = await setChecked(id, false);
    if (result?.success) onItemChecked?.(false, item?.name || 'Expense');
  }, [setChecked, onItemChecked, onRequestCheck, items]);

  return (
    <View>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
        {/* marginLeft matches ROW_PAD.paddingHorizontal below — the card's
            own rows start there before the checkbox, so this lines this
            caption's text up with the checkboxes underneath it instead of
            sitting flush with the card's bare left edge. */}
        <Text style={[BODY, { color: textColor(light).tertiary, marginLeft: ROW_PAD.paddingHorizontal }]}>
          Plan your next salary
        </Text>
        <View className="flex-row items-center" style={{ gap: 14 }}>
          {/* Only once there's something TO clear — an empty list already
              says "Nothing planned yet" below, so a clear action next to
              that would just be asking to clear nothing. */}
          {items.length > 0 && (
            <Pressable onPress={onRequestClear} accessibilityRole="button" accessibilityLabel="Clear plan list" hitSlop={8}>
              <Text style={{ fontSize: 13, color: textColor(light).tertiary }}>Clear list</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onAddPress}
            accessibilityRole="button"
            accessibilityLabel="Plan an expense"
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: dim(light, 0.08) }}
          >
            <PlusIcon size={16} color={dim(light, 0.5)} />
          </Pressable>
        </View>
      </View>

      <Card light={light}>
        <View style={{ paddingVertical: 8 }}>
        {items.length === 0 ? (
          <Text style={[ROW_PAD, { fontSize: 14, color: textColor(light).tertiary }]}>Nothing planned yet.</Text>
        ) : (
          <>
            {items.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                onChangeAmount={amount => updateItem(item.id, { amount })}
                onDelete={onRequestDeleteItem}
                onToggleChecked={handleToggleChecked}
                onPress={() => onEditItem(item)}
                registerSwipeable={swipes.registerSwipeable}
                onSwipeOpen={swipes.onSwipeOpen}
                light={light}
                isLast={i === items.length - 1}
              />
            ))}
            <View
              style={[
                ROW_PAD,
                { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: dim(light, 0.08) },
              ]}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: light ? '#111111' : '#ffffff' }}>{money(total)}</Text>
            </View>
          </>
        )}
        </View>
      </Card>
    </View>
  );
}

// The one popup this feature needs: a name and an amount, nothing else —
// same minimal ask as the plan itself. Rendered as a sibling of the page
// (see WalletPage), same as the savings/debt sheets, so it slides up
// over everything including the header. Built on the same shared sheet
// those use — see AmountEntrySheet.js.

// `editItem` (or null) is what tells this sheet it's editing an existing
// line rather than starting a new one — its own name and amount become the
// starting point instead of the blank/default ones, the title and button
// say "Edit"/"Save" instead of "Add", and submitting calls `onEdit` with its
// id instead of `onAdd`. Suggestion chips are an add-only shortcut — a line
// already has a name once you're editing it.
export function AddBudgetItemSheet({ open, onClose, onClosed, onAdd, onEdit, editItem, suggestions = [], light = false }) {
  const isEdit = !!editItem;
  return (
    <AmountEntrySheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      light={light}
      namePlaceholder="e.g. Rent, EMI, investment"
      initialName={editItem?.name || ''}
      nameSuggestions={isEdit ? [] : suggestions}
      initialAmount={editItem?.amount ?? 0}
      // Fixed, not left to AmountEntrySheet's own default — that default
      // grows the sheet (and with it, the name field's position on
      // screen) the moment focusing the name field reveals the
      // suggestion chips. Sized as if the chips were always showing, so
      // that growth never happens: the name field stays put.
      //
      // 0.72 — the same COMPACT_RATIO every other caller falls back to,
      // not a smaller value. Tried 0.62 for a more compact feel, but
      // InlineSheet clips its own content (overflow:'hidden'), and the
      // keypad+button footer below has a fixed height that doesn't shrink
      // to make room — 0.62 left too little of the sheet for the amount
      // row's own flex area, clipping the digits instead of just tightening
      // the gap around them. 0.72 is the smallest that's actually been
      // proven to fit this same footer elsewhere in the app.
      heightRatio={0.72}
      amountLabel=""
      submitLabel={isEdit ? 'Save' : 'Add'}
      onSubmit={isEdit ? (data) => onEdit(editItem.id, data) : onAdd}
      boxedNameField
      title={isEdit ? 'Edit plan' : 'Add plan'}
    />
  );
}

export default memo(BudgetPlan);
