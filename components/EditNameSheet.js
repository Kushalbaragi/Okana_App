import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedModal } from './AnimatedModal';
import { AuthField, PersonIcon, PillButton } from './AuthKit';
import { GUTTER } from '../utils/spacing';
import { FONT } from '../utils/type';

// Changing your name, from a sheet that slides up from the bottom — the same
// field as the one asked for at sign-up, a title, one button. The field is not
// focused on open, so the sheet arrives on its own; tapping the field brings up
// the keyboard, and the sheet rises with it (see AnimatedModal). It can be pulled
// down with a finger to close.
export default function EditNameSheet({ open, value, onChange, onSave, onClose, onClosed, saving, error, unchanged }) {
  const insets = useSafeAreaInsets();
  return (
    <AnimatedModal open={open} onClose={onClose} onClosed={onClosed} variant="bottom" swipeToClose>
      <View
        style={{
          backgroundColor: 'rgba(14,14,14,0.97)',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderCurve: 'continuous',
          borderTopWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          paddingTop: 12,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <View style={{ width: 32, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 20 }} />
        <Text style={{ fontSize: FONT.title, fontWeight: '600', color: '#ffffff', textAlign: 'center', marginBottom: 24 }}>Your name</Text>
        <AuthField
          icon={<PersonIcon />}
          value={value}
          onChangeText={onChange}
          onClear={() => onChange('')}
          placeholder="Full name"
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          onSubmitEditing={onSave}
          maxLength={60}
        />
        <Text numberOfLines={2} style={{ fontSize: FONT.caption, color: 'rgba(248,113,113,0.9)', textAlign: 'center', marginTop: 14, minHeight: 18, paddingHorizontal: GUTTER }}>
          {error}
        </Text>
        <View style={{ height: 12 }} />
        <PillButton label="Save" onPress={onSave} loading={saving} loadingLabel="Saving…" dim={!value.trim() || unchanged} />
      </View>
    </AnimatedModal>
  );
}
