import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Linking, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { useTransactions } from '../../hooks/useTransactions';
import { supabase } from '../../lib/supabase';
import { BackIcon, ChevronRight } from '../../components/icons';
import { AnimatedModal } from '../../components/AnimatedModal';

const APP_VERSION = '1.0.0';

function MailIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Rect x="1" y="3" width="14" height="10" rx="2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
      <Path d="M1 5l7 5 7-5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

function InstagramIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="2" width="20" height="20" rx="6" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <Circle cx="12" cy="12" r="4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <Circle cx="17.5" cy="6.5" r="1" fill="rgba(255,255,255,0.5)" />
    </Svg>
  );
}

function TwitterIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
      <Path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </Svg>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16 }} />;
}

function SectionLabel({ children }) {
  return <Text className="text-white/30 text-[11px] font-medium uppercase tracking-widest px-1 pt-2 mb-2">{children}</Text>;
}

function Card({ children }) {
  return (
    <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
      {children}
    </View>
  );
}

function Row({ label, value, onPress, right }) {
  const content = (
    <View className="flex-row items-center justify-between px-4 py-[14px]">
      <Text className="text-white text-base">{label}</Text>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        {!!value && <Text className="text-white/35 text-xs">{value}</Text>}
        {right || (onPress && !right && <ChevronRight />)}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

function InfoModal({ open, title, onClose, children }) {
  const { height: windowHeight } = useWindowDimensions();
  return (
    <AnimatedModal open={open} onClose={onClose} variant="bottom">
      <View
        className="px-6 pt-5 pb-10"
        style={{ maxHeight: windowHeight * 0.8, backgroundColor: 'rgba(14,14,14,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <View className="w-8 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <Text className="text-white font-semibold text-base mb-4">{title}</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </AnimatedModal>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { transactions } = useTransactions();

  const [modal, setModal] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  async function sendFeedback() {
    if (!feedbackText.trim()) return;
    setFeedbackSending(true);
    setFeedbackError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: feedbackText.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to send feedback');
      setFeedbackSent(true);
      setTimeout(() => { setFeedbackSent(false); setFeedbackText(''); setModal(null); }, 1500);
    } catch (err) {
      setFeedbackError(err.message);
    } finally {
      setFeedbackSending(false);
    }
  }

  async function exportData() {
    if (!transactions.length) return;
    const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const csv = ['Date,Type,Amount,Description',
      ...sorted.map(t => `${t.date},${t.type},${t.amount},"${t.description}"`),
    ].join('\n');
    const fileUri = `${FileSystem.cacheDirectory}okana-${new Date().toISOString().slice(0, 10)}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export transactions' });
    }
  }

  return (
    <View className="flex-1 bg-bg">
      <ScrollView>
        <View className="flex-row items-center gap-2 px-4 pt-14 pb-4">
          <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-xl">
            <BackIcon />
          </Pressable>
          <Text className="text-white text-base font-semibold">Settings</Text>
        </View>

        <View className="px-4 pb-16" style={{ gap: 12 }}>
          <View>
            <SectionLabel>Legal</SectionLabel>
            <Card>
              <Row label="Privacy Policy" onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Privacy-Policy-3c58f887c3c9806180c1ed51844d872e?source=copy_link')} />
              <Divider />
              <Row label="Terms & Conditions" onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Terms-and-Condition-3c58f887c3c9806d86eae7473775949c?source=copy_link')} />
              <Divider />
              <Row label="Refund & Cancellation Policy" onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Refund-Cancellation-Policy-3c58f887c3c980c48cb6ded1520897ed?source=copy_link')} />
            </Card>
          </View>

          <View>
            <SectionLabel>Data</SectionLabel>
            <Card>
              <Row label="Backup" value="Coming soon" />
              <Divider />
              <Row label="Export / Import" onPress={exportData} right={<Text className="text-white/35 text-xs">CSV</Text>} />
            </Card>
          </View>

          <View>
            <SectionLabel>Support</SectionLabel>
            <Card>
              <Row label="Contact" onPress={() => setModal('contact')} />
              <Divider />
              <Row label="Feedback" onPress={() => setModal('feedback')} />
              <Divider />
              <Row label="Rate Us" value="Coming soon" />
            </Card>
          </View>

          <View>
            <SectionLabel>About</SectionLabel>
            <Card>
              <Row label="Developer" onPress={() => setModal('developer')} />
              <Divider />
              <Row label="App Version" value={APP_VERSION} />
            </Card>
          </View>
        </View>
      </ScrollView>

      <InfoModal open={modal === 'contact'} title="Contact" onClose={() => setModal(null)}>
        <Text className="text-white/45 text-base mb-3">Have a question or need help? Reach out directly.</Text>
        <Pressable
          onPress={() => Linking.openURL('mailto:kushalbaragi@gmail.com')}
          className="flex-row items-center py-3 px-4 rounded-xl"
          style={{ gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <MailIcon />
          <Text className="text-white/60 text-base">kushalbaragi@gmail.com</Text>
        </Pressable>
        <Text className="text-white/20 mt-3" style={{ fontSize: 12 }}>We typically respond within 1–2 business days.</Text>
      </InfoModal>

      <InfoModal open={modal === 'feedback'} title={feedbackSent ? '✓ Feedback sent!' : 'Send Feedback'} onClose={() => setModal(null)}>
        {!feedbackSent && (
          <>
            <Text className="text-white/40 text-base mb-4" style={{ lineHeight: 22 }}>
              Tell us what you love, what's broken, or what you'd like to see next.
            </Text>
            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="Your feedback…"
              placeholderTextColor="#4d4d4d"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="text-white text-base px-4 py-3 mb-4"
              style={{ minHeight: 100, borderRadius: 12, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}
            />
            {!!feedbackError && <Text className="text-red-400 text-base mb-4">{feedbackError}</Text>}
            <Pressable
              onPress={sendFeedback}
              disabled={!feedbackText.trim() || feedbackSending}
              className="w-full py-[14px] rounded-2xl items-center"
              style={{ backgroundColor: '#ffffff', opacity: !feedbackText.trim() || feedbackSending ? 0.3 : 1 }}
            >
              <Text className="text-black text-base font-semibold">{feedbackSending ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </>
        )}
      </InfoModal>

      <InfoModal open={modal === 'developer'} title="Developer" onClose={() => setModal(null)}>
        <View className="items-center py-4" style={{ gap: 12 }}>
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <Text className="text-white font-bold" style={{ fontSize: 24 }}>K</Text>
          </View>
          <Text className="text-white font-semibold text-base">Kushal Baragi</Text>
          <Text className="text-white/40 text-base text-center">Built this app to make personal finance simple, beautiful, and private.</Text>
          <View className="flex-row justify-center" style={{ gap: 12 }}>
            <Pressable
              onPress={() => Linking.openURL('https://instagram.com/kushalbaragi')}
              className="flex-row items-center px-4 py-2 rounded-xl"
              style={{ gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <InstagramIcon />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Instagram</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL('https://twitter.com/kushalbaragi')}
              className="flex-row items-center px-4 py-2 rounded-xl"
              style={{ gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <TwitterIcon />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Twitter</Text>
            </Pressable>
          </View>
          <Text className="text-white/20" style={{ fontSize: 12 }}>Okana v{APP_VERSION} · Made with ♥ in India</Text>
        </View>
      </InfoModal>
    </View>
  );
}
