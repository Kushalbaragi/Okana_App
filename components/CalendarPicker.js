import { memo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { GlassView, GlassPressable } from './Glass';
import { MONTH_NAMES as MONTHS } from '../utils/monthlyRecap';
import { toDateStr as toStr } from '../utils/format';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function CalendarPicker({ value, onChange, onClose }) {
  const selected = parseLocal(value);
  const [view, setView] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayStr = toStr(new Date());
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function prev() { setView(new Date(year, month - 1, 1)); }
  function next() { setView(new Date(year, month + 1, 1)); }

  function pick(d) {
    const dateStr = toStr(new Date(year, month, d));
    onChange(dateStr);
    onClose();
  }

  const selStr = toStr(selected);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <GlassView variant="glass" radius={16} className="p-4 w-full">
      <View className="flex-row items-center justify-between mb-4">
        <GlassPressable variant="glass" radius={9999} onPress={prev} className="w-8 h-8 items-center justify-center">
          <Text className="text-white/60 text-lg">‹</Text>
        </GlassPressable>
        <Text className="text-white text-base font-semibold">{MONTHS[month]} {year}</Text>
        <GlassPressable variant="glass" radius={9999} onPress={next} className="w-8 h-8 items-center justify-center">
          <Text className="text-white/60 text-lg">›</Text>
        </GlassPressable>
      </View>

      <View className="flex-row mb-1">
        {DAYS.map(d => (
          <View key={d} className="flex-1 items-center py-1">
            <Text className="text-white/30 text-xs font-medium">{d}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row">
          {week.map((d, i) => {
            if (!d) return <View key={i} className="flex-1 aspect-square" />;
            const str = toStr(new Date(year, month, d));
            const isSelected = str === selStr;
            const isToday = str === todayStr;
            return (
              <View key={i} className="flex-1 aspect-square items-center justify-center">
                {isSelected ? (
                  <GlassPressable
                    variant="active"
                    radius={9999}
                    onPress={() => pick(d)}
                    className="w-8 h-8 items-center justify-center"
                  >
                    <Text className="text-white text-base font-semibold">{d}</Text>
                  </GlassPressable>
                ) : (
                  <Pressable
                    onPress={() => pick(d)}
                    className="w-8 h-8 rounded-full items-center justify-center"
                    style={isToday ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' } : null}
                  >
                    <Text className={isToday ? 'text-white text-base font-medium' : 'text-white/60 text-base'}>{d}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </GlassView>
  );
}

export default memo(CalendarPicker);
