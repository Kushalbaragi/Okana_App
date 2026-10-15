import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { getDaysInMonth, parseISO } from 'date-fns';
import { ChevronRight } from './icons';
import { toDateStr, today } from '../utils/format';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { textColor } from '../utils/colors';
import { FONT, TABULAR } from '../utils/type';

// A plain month calendar for picking one day, used by the add-transaction sheet on
// Home. Tap a day to pick it. Tap the month and year at the top to jump straight to
// another month or year instead of paging back one month at a time. Days after
// `maxDate` can't be picked.
const CELL = 40;
const ROWS = 6; // always six, so the calendar never changes height between months
const SWAP_MS = 220;
const MIN_YEAR = 2000;
// Monday first.
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Arrow({ dir, onPress, disabled, color, label }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.25 : 1 }}
    >
      <View style={{ transform: [{ rotate: dir < 0 ? '180deg' : '0deg' }] }}>
        <ChevronRight size={16} color={color} />
      </View>
    </Pressable>
  );
}

function DayCalendar({ value, onChange, light, maxDate }) {
  const max = parseISO(maxDate || today());
  const maxMonthIndex = max.getFullYear() * 12 + max.getMonth();
  const start = parseISO(value);
  const [view, setView] = useState(start.getFullYear() * 12 + start.getMonth());
  // 'days' is the month grid; 'months' is the month and year chooser.
  const [mode, setMode] = useState('days');
  const [pickerYear, setPickerYear] = useState(start.getFullYear());

  const year = Math.floor(view / 12);
  const month = view % 12;
  const text = textColor(light);
  const strong = light ? '#111111' : '#ffffff';
  const selectedFill = light ? '#111111' : '#ffffff';
  const selectedText = light ? '#ffffff' : '#000000';
  const todayStr = today();

  // 42 cells: blanks before the 1st (Monday first), the days, then blanks after.
  const cells = useMemo(() => {
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = getDaysInMonth(new Date(year, month, 1));
    return Array.from({ length: ROWS * 7 }, (_, i) => {
      const day = i - lead + 1;
      return day >= 1 && day <= count ? day : null;
    });
  }, [year, month]);

  const step = useCallback(dir => setView(v => Math.max(MIN_YEAR * 12, Math.min(maxMonthIndex, v + dir))), [maxMonthIndex]);
  const openMonths = useCallback(() => { setPickerYear(year); setMode('months'); }, [year]);
  const chooseMonth = useCallback(m => { setView(Math.min(maxMonthIndex, pickerYear * 12 + m)); setMode('days'); }, [pickerYear, maxMonthIndex]);

  const inMonths = mode === 'months';
  const titleYear = inMonths ? pickerYear : year;
  const maxYear = max.getFullYear();

  return (
    <View style={{ paddingHorizontal: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <Arrow
          dir={-1}
          label={inMonths ? 'Previous year' : 'Previous month'}
          color={text.tertiary}
          disabled={inMonths ? pickerYear <= MIN_YEAR : view <= MIN_YEAR * 12}
          onPress={() => (inMonths ? setPickerYear(y => y - 1) : step(-1))}
        />
        <Pressable
          onPress={() => (inMonths ? setMode('days') : openMonths())}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={inMonths ? 'Back to days' : 'Choose month and year'}
        >
          <Text style={{ fontSize: FONT.body, fontWeight: '500', color: strong }}>
            {inMonths ? titleYear : `${MONTH_NAMES[month]} ${year}`}
          </Text>
        </Pressable>
        <Arrow
          dir={1}
          label={inMonths ? 'Next year' : 'Next month'}
          color={text.tertiary}
          disabled={inMonths ? pickerYear >= maxYear : view >= maxMonthIndex}
          onPress={() => (inMonths ? setPickerYear(y => y + 1) : step(1))}
        />
      </View>

      {/* Both views share one fixed height, so switching between them never moves
          anything around them. Each fades in on its own. */}
      <View style={{ height: 24 + CELL * ROWS, marginTop: 4 }}>
        {inMonths ? (
          <Animated.View key="months" entering={FadeIn.duration(SWAP_MS)} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MONTH_NAMES.map((name, m) => {
              const off = pickerYear * 12 + m > maxMonthIndex;
              const on = pickerYear * 12 + m === view;
              return (
                <Pressable
                  key={name}
                  disabled={off}
                  onPress={() => chooseMonth(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`${name} ${pickerYear}`}
                  style={{ width: '33.333%', height: 56, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? selectedFill : 'transparent' }}>
                    <Text style={{ fontSize: FONT.body, color: on ? selectedText : off ? text.disabled : strong }}>{name.slice(0, 3)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>
        ) : (
          <Animated.View key={`days-${view}`} entering={FadeIn.duration(SWAP_MS)}>
            <View style={{ flexDirection: 'row', height: 24 }}>
              {WEEKDAYS.map((d, i) => (
                <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: FONT.caption, color: text.disabled }}>{d}</Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((day, i) => {
                if (day == null) return <View key={i} style={{ width: `${100 / 7}%`, height: CELL }} />;
                const str = toDateStr(new Date(year, month, day));
                const off = str > (maxDate || todayStr);
                const on = str === value;
                const isToday = str === todayStr;
                return (
                  <Pressable
                    key={i}
                    disabled={off}
                    onPress={() => onChange(str)}
                    accessibilityRole="button"
                    accessibilityLabel={`${day} ${MONTH_NAMES[month]} ${year}`}
                    accessibilityState={{ selected: on, disabled: off }}
                    style={{ width: `${100 / 7}%`, height: CELL, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? selectedFill : 'transparent' }}>
                      <Text style={{ fontSize: FONT.body, fontWeight: isToday && !on ? '600' : '400', color: on ? selectedText : off ? text.disabled : strong, ...TABULAR }}>{day}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export default memo(DayCalendar);
