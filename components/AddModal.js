import { memo, useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line } from 'react-native-svg';
import { today, toTitleCase } from '../utils/format';
import CalendarPicker from './CalendarPicker';
import { GlassView, GlassPressable } from './Glass';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDisplay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function CalIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Rect x="1" y="2.5" width="12" height="10.5" rx="2" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <Line x1="1" y1="5.5" x2="13" y2="5.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <Line x1="4.5" y1="1" x2="4.5" y2="4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round" />
      <Line x1="9.5" y1="1" x2="9.5" y2="4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

function AddModal({ open, onClose, onAdd, onEdit, onDelete, editData }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // A concrete pixel cap, not a percentage string — percentage heights are
  // ambiguous in RN's layout engine once nested inside flex + ScrollView
  // (resolves fine in the web preview's browser-based layout, but silently
  // collapses content on real native devices). This was the root cause of
  // the Description field/submit button rendering squished on-device.
  const sheetMaxHeight = Math.round(windowHeight * 0.85);
  const isEdit = !!editData;
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const amountRef = useRef(null);

  useEffect(() => {
    if (open) {
      if (editData) {
        setType(editData.type);
        setAmount(String(editData.amount));
        setDate(editData.date);
        setDescription(editData.description);
      } else {
        setType('expense');
        setAmount('');
        setDate(today());
        setDescription('');
      }
      setCalOpen(false);
    }
  }, [open, editData]);

  function handleSubmit() {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    if (isEdit) {
      onEdit(editData.id, { type, amount: val, date, description: toTitleCase(description) });
    } else {
      onAdd({ type, amount: val, date, description: toTitleCase(description) });
    }
    onClose();
  }

  const canSubmit = !!amount && parseFloat(amount) > 0;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ maxHeight: sheetMaxHeight }}
        >
          <GlassView
            variant="modal"
            radius={24}
            corners="t"
            className="px-6 pt-5"
            style={{ maxHeight: sheetMaxHeight, paddingBottom: insets.bottom }}
          >
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1, maxHeight: sheetMaxHeight - 100 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <View className="w-8 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />

            <View className="flex-row rounded-full p-[3px] mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
              {['expense', 'income'].map(t => (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  className="flex-1 py-[6px] rounded-full items-center"
                  style={type === t ? { backgroundColor: 'rgba(255,255,255,0.14)' } : null}
                >
                  <Text className={type === t ? 'text-white text-xs font-medium' : 'text-white/35 text-xs font-medium'}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="mb-6 items-center">
              <View className="flex-row items-center justify-center gap-1">
                <Text className="text-4xl font-light text-white/35" style={{ lineHeight: 56 }}>₹</Text>
                <TextInput
                  ref={amountRef}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor="#333333"
                  keyboardType="decimal-pad"
                  className="font-semibold text-center text-white"
                  // text-5xl's default lineHeight (1x font-size) is too tight for
                  // iOS to render tall digit glyphs in a TextInput without
                  // clipping their tops — set both explicitly with headroom.
                  style={{ minWidth: 120, fontSize: 48, lineHeight: 56 }}
                />
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-white/35 text-xs font-medium mb-2 uppercase tracking-wider">Date</Text>
              <GlassPressable
                variant="glass"
                onPress={() => setCalOpen(true)}
                className="w-full px-4 py-3 flex-row items-center justify-between"
              >
                <Text className="text-white text-sm">{formatDisplay(date)}</Text>
                <CalIcon />
              </GlassPressable>
            </View>

            <View className="mb-6">
              <Text className="text-white/35 text-xs font-medium mb-2 uppercase tracking-wider">Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What was this for?"
                placeholderTextColor="#333333"
                className="w-full rounded-xl px-4 py-3 text-white text-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
              />
            </View>

          </ScrollView>

          {/* Fixed footer — always visible regardless of scroll position, so the
              action button can never end up scrolled out of view (was the bug).
              Bottom safe-area padding lives on the GlassView itself so it's part
              of the visible card, not a gap exposing the backdrop behind it. */}
          <View style={{ paddingTop: 12 }}>
            {isEdit ? (
              <View className="flex-row gap-3">
                <GlassPressable
                  variant="active"
                  radius={16}
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                  className="flex-1 py-[14px] items-center"
                >
                  <Text className="text-white text-sm font-semibold">Update</Text>
                </GlassPressable>
                <Pressable
                  onPress={() => { onDelete(editData.id); onClose(); }}
                  className="flex-1 py-[14px] rounded-2xl items-center"
                  style={{ backgroundColor: 'rgba(248,113,113,0.12)' }}
                >
                  <Text className="text-sm font-semibold" style={{ color: 'rgba(248,113,113,0.85)' }}>Delete</Text>
                </Pressable>
              </View>
            ) : (
              <GlassPressable
                variant="active"
                radius={16}
                disabled={!canSubmit}
                onPress={handleSubmit}
                className="w-full py-[14px] items-center"
              >
                <Text className="text-white text-sm font-semibold">Add {type.charAt(0).toUpperCase() + type.slice(1)}</Text>
              </GlassPressable>
            )}
          </View>
          </GlassView>
        </KeyboardAvoidingView>
      </View>

      {/* Calendar overlay — lives inside this same Modal (avoids nested-Modal quirks on iOS) */}
      {calOpen && (
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }]}
          onPress={() => setCalOpen(false)}
        >
          <View style={{ width: '100%', maxWidth: 360 }}>
            <CalendarPicker value={date} onChange={setDate} onClose={() => setCalOpen(false)} />
          </View>
        </Pressable>
      )}
    </Modal>
  );
}

export default memo(AddModal);
