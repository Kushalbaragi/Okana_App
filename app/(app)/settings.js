import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Linking, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { useTransactions } from '../../hooks/useTransactions';
import { useNetwork } from '../../context/NetworkContext';
import { isConnectivityError } from '../../utils/errors';
import { supabase } from '../../lib/supabase';
import { buildTransactionsWorkbook, parseTransactionsWorkbook } from '../../utils/exportImport';
import { BackIcon, ChevronRight } from '../../components/icons';
import { AnimatedModal } from '../../components/AnimatedModal';

const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

function YouTubeIcon() {
  return (
    <Svg width={16} height={14} viewBox="0 0 24 17" fill="none">
      <Rect x="0.5" y="0.5" width="23" height="16" rx="4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.3" />
      <Path d="M10 5.5l6 3-6 3v-6z" fill="rgba(255,255,255,0.5)" />
    </Svg>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16 }} />;
}

function SectionLabel({ children }) {
  return (
    <Text
      className="text-white/30 text-[11px] font-medium uppercase tracking-widest px-1 pt-2 mb-2">{children}</Text>
  );
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
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </AnimatedModal>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { transactions, importTransactions } = useTransactions();
  const { isOnline, isOnlineRef, notifyOffline } = useNetwork();

  const [modal, setModal] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // idle | reading | importing | done | error
  const [importStage, setImportStage] = useState('idle');
  const [importMessage, setImportMessage] = useState('');
  const [importErrorMsg, setImportErrorMsg] = useState('');
  const importProgress = useSharedValue(0);
  const progressBarStyle = useAnimatedStyle(() => ({ width: `${importProgress.value * 100}%` }));

  // Cleared on unmount so a completed import's delayed redirect can't fire
  // after the user has already navigated elsewhere (e.g. tapped back right
  // after seeing "Imported N transactions") and force them back to Home.
  const importRedirectTimeoutRef = useRef(null);
  useEffect(() => () => {
    if (importRedirectTimeoutRef.current) clearTimeout(importRedirectTimeoutRef.current);
  }, []);

  function closeFeedbackModal() {
    setModal(null);
    setFeedbackText('');
    setFeedbackError('');
  }

  async function sendFeedback() {
    if (!feedbackText.trim()) return;
    if (!isOnline) { notifyOffline(); return; }
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
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); }
      else { setFeedbackError(err.message || 'Failed to send feedback. Please try again.'); }
    } finally {
      setFeedbackSending(false);
    }
  }

  async function exportData() {
    if (!transactions.length || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const base64 = buildTransactionsWorkbook(transactions);
      const fileUri = `${FileSystem.cacheDirectory}okana-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: XLSX_MIME, dialogTitle: 'Export transactions' });
      } else {
        setExportError('Sharing is not available on this device.');
      }
    } catch (err) {
      setExportError(err.message || 'Failed to export. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  // One continuous flow, no intermediate confirm step: pick a file, read
  // it, import it, then drop the user onto Home where they can see the
  // result for themselves — with a full-screen green progress bar the
  // whole way through instead of leaving Settings looking unresponsive.
  async function pickImportFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [XLSX_MIME, 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      if (!isOnline) { notifyOffline(); return; }

      setImportErrorMsg('');
      setImportStage('reading');
      // A small kick so the bar visibly moves even during the read/parse
      // step, which has no real sub-progress to report.
      importProgress.value = withTiming(0.08, { duration: 400, easing: SETTLE_EASING });
      // Yields so "Reading file…" actually paints before the synchronous,
      // CPU-heavy XLSX parse below blocks the JS thread — RN has no worker
      // thread to offload it to, so without this the UI would look frozen
      // with zero feedback for however long the parse takes.
      await new Promise(resolve => setTimeout(resolve, 50));

      const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { parsed, skipped } = parseTransactionsWorkbook(base64);
      if (!parsed.length) {
        setImportErrorMsg(skipped.length
          ? "Couldn't read any valid rows — check the Date, Type, and Amount columns."
          : 'That file has no transaction rows.');
        setImportStage('error');
        return;
      }

      setImportStage('importing');
      importProgress.value = withTiming(0.15, { duration: 600, easing: SETTLE_EASING });

      const importStartedAt = Date.now();
      const res = await importTransactions(parsed, (done, total) => {
        importProgress.value = withTiming(done / total, { duration: 500, easing: SETTLE_EASING });
      });

      if (!res.success) {
        if (res.offline) { notifyOffline(); setImportStage('idle'); return; }
        setImportErrorMsg(res.error || 'Import failed. Please try again.');
        setImportStage('error');
        return;
      }

      // A fast, small import (the common case — one chunk, one quick
      // network round-trip) could otherwise jump from a sliver of progress
      // straight to done in well under a second, reading as rushed rather
      // than a real, deliberate progress bar.
      const MIN_IMPORTING_MS = 1000;
      const elapsed = Date.now() - importStartedAt;
      if (elapsed < MIN_IMPORTING_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_IMPORTING_MS - elapsed));
      }

      importProgress.value = withTiming(1, { duration: 400, easing: SETTLE_EASING });
      setImportMessage(
        `Imported ${res.imported} transaction${res.imported === 1 ? '' : 's'}`
        + (skipped.length ? ` — ${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped` : '')
      );
      setImportStage('done');

      importRedirectTimeoutRef.current = setTimeout(() => {
        setImportStage('idle');
        router.replace('/(app)');
      }, 1700);
    } catch (err) {
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); setImportStage('idle'); return; }
      setImportErrorMsg(err.message || 'Something went wrong. Please try again.');
      setImportStage('error');
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
              <Row
                label="Export Data"
                onPress={exportData}
                right={exporting
                  ? <Text className="text-white/35 text-xs">Exporting…</Text>
                  : <Text className="text-white/35 text-xs">XLSX</Text>}
              />
              <Divider />
              <Row
                label="Import Data"
                onPress={pickImportFile}
                right={<Text className="text-white/35 text-xs">XLSX</Text>}
              />
            </Card>
            {!!exportError && (
              <Text className="text-red-400 text-sm mt-2 px-1">{exportError}</Text>
            )}
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

      <InfoModal open={modal === 'feedback'} title={feedbackSent ? '✓ Feedback sent!' : 'Send Feedback'} onClose={closeFeedbackModal}>
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
        <View style={{ paddingVertical: 4 }}>
          <Image
            source={require('../../assets/developer-photo.jpg')}
            style={{ width: 84, height: 84, borderRadius: 16, marginBottom: 16 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
          <Text className="text-white font-semibold text-lg mb-3">Hi, I'm Kushal</Text>
          <Text className="text-white/50 text-base mb-3" style={{ lineHeight: 22 }}>
            I'm a software developer and creator from Karnataka. I build digital products, work mainly on the frontend, and enjoy turning simple ideas into useful things.
          </Text>
          <Text className="text-white/50 text-base mb-3" style={{ lineHeight: 22 }}>
            I also make YouTube videos about personal finance, technology, productivity, and minimal living. I like learning by building, sharing what I learn, and documenting the journey along the way.
          </Text>
          <Text className="text-white/50 text-base mb-5" style={{ lineHeight: 22 }}>
            I'm interested in technology, money, and creating a simpler life — and I'm always working on something new.
          </Text>

          <View className="flex-row" style={{ gap: 12 }}>
            <Pressable
              onPress={() => Linking.openURL('https://instagram.com/kushalbaragi')}
              className="flex-row items-center px-4 py-2 rounded-xl"
              style={{ gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <InstagramIcon />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Instagram</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL('https://www.youtube.com/@kushalbaragi')}
              className="flex-row items-center px-4 py-2 rounded-xl"
              style={{ gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <YouTubeIcon />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>YouTube</Text>
            </Pressable>
          </View>

          <Text className="text-white/20 mt-5" style={{ fontSize: 12 }}>Okana v{APP_VERSION} · Made with ♥ in India</Text>
        </View>
      </InfoModal>

      {importStage !== 'idle' && (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
          }}
        >
          <View style={{ width: '100%', maxWidth: 300 }}>
            {importStage === 'error' ? (
              <>
                <Text className="text-white text-base font-semibold mb-2 text-center">
                  Import failed
                </Text>
                <Text className="text-white/50 text-sm mb-5 text-center" style={{ lineHeight: 20 }}>
                  {importErrorMsg}
                </Text>
                <Pressable
                  onPress={() => setImportStage('idle')}
                  className="py-[13px] rounded-2xl items-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <Text className="text-white text-base font-medium">Dismiss</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text className="text-white text-base font-medium mb-4 text-center">
                  {importStage === 'reading' && 'Reading file…'}
                  {importStage === 'importing' && 'Importing transactions…'}
                  {importStage === 'done' && importMessage}
                </Text>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', width: '100%' }}>
                  <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: '#4ade80' }, progressBarStyle]} />
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
