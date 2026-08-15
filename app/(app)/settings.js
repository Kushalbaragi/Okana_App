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
      <Text className="text-white text-sm">{label}</Text>
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

function P({ children, bold }) {
  return (
    <Text className="text-white/45 text-sm mb-3" style={{ lineHeight: 20 }}>
      {bold ? <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>{bold} </Text> : null}
      {children}
    </Text>
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
              <Row label="Privacy Policy" onPress={() => setModal('privacy')} />
              <Divider />
              <Row label="Terms & Conditions" onPress={() => setModal('terms')} />
              <Divider />
              <Row label="Refund & Cancellation Policy" onPress={() => setModal('refund')} />
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

      <InfoModal open={modal === 'privacy'} title="Privacy Policy" onClose={() => setModal(null)}>
        <P>Okana is designed with your privacy as the top priority.</P>
        <P bold="Data storage:">All your financial data is stored securely in Supabase with row-level security. Only you can access your own data.</P>
        <P bold="No selling:">We do not sell, share, or monetise your personal data in any way.</P>
        <P bold="Authentication:">Login is handled by Supabase Auth with industry-standard encryption.</P>
        <P bold="Payments:">Okana Plus subscription payments are processed by Razorpay, a PCI-DSS compliant payment gateway. Okana never sees or stores your card number, CVV, or full payment details — Razorpay handles that directly, and we only keep a masked reference (e.g. card network and last 4 digits) so we can show your saved payment method.</P>
        <P bold="Analytics:">No third-party analytics or tracking libraries are used in this app.</P>
        <P bold="Deletion:">You can erase all your data or delete your account at any time from the Account page. Deleting your account also cancels any active Okana Plus subscription.</P>
        <Text className="text-white/25" style={{ fontSize: 12 }}>Last updated: August 2026</Text>
      </InfoModal>

      <InfoModal open={modal === 'terms'} title="Terms & Conditions" onClose={() => setModal(null)}>
        <P>By using Okana you agree to the following terms.</P>
        <P bold="Personal use:">This app is provided for personal, non-commercial use only.</P>
        <P bold="Accuracy:">The app is a tracking tool and does not constitute financial advice. Always verify important financial decisions with a qualified professional.</P>
        <P bold="Subscription & billing:">Okana Plus costs ₹499/year after a 30-day free trial. A payment method is collected via Razorpay when your trial starts and is charged automatically when the trial ends, unless you cancel first. Subscriptions renew automatically every year until cancelled. See our Refund & Cancellation Policy for details.</P>
        <P bold="Availability:">The app is provided "as is". We make no guarantees regarding uptime or data availability.</P>
        <P bold="Changes:">We may update these terms at any time. Continued use of the app constitutes acceptance.</P>
        <P bold="Contact:">For any queries, reach out to the developer directly.</P>
        <Text className="text-white/25" style={{ fontSize: 12 }}>Last updated: August 2026</Text>
      </InfoModal>

      <InfoModal open={modal === 'refund'} title="Refund & Cancellation Policy" onClose={() => setModal(null)}>
        <P bold="Free trial:">Cancel anytime during your 30-day trial from the Subscription page — you won't be charged anything.</P>
        <P bold="Cancelling a paid subscription:">Cancel anytime from the Subscription page. Your plan won't renew, but you keep full access to Okana Plus until the end of the period you've already paid for.</P>
        <P bold="Refunds:">Okana Plus is a digital subscription that gives you immediate access to features. Payments already processed for the current billing period are non-refundable, including for early or partial cancellation.</P>
        <P bold="Charged in error:">If you believe you were charged incorrectly — a duplicate charge, or a charge after you cancelled — contact us within 7 days at kushalbaragi@gmail.com and we'll investigate and refund if warranted.</P>
        <P bold="Failed payments:">If a renewal payment fails, we'll prompt you to update your payment method. Access to adding new transactions is paused until it's resolved; your existing data always stays visible.</P>
        <Text className="text-white/25" style={{ fontSize: 12 }}>Last updated: August 2026</Text>
      </InfoModal>

      <InfoModal open={modal === 'contact'} title="Contact" onClose={() => setModal(null)}>
        <Text className="text-white/45 text-sm mb-3">Have a question or need help? Reach out directly.</Text>
        <Pressable
          onPress={() => Linking.openURL('mailto:kushalbaragi@gmail.com')}
          className="flex-row items-center py-3 px-4 rounded-xl"
          style={{ gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <MailIcon />
          <Text className="text-white/60 text-sm">kushalbaragi@gmail.com</Text>
        </Pressable>
        <Text className="text-white/20 mt-3" style={{ fontSize: 12 }}>We typically respond within 1–2 business days.</Text>
      </InfoModal>

      <InfoModal open={modal === 'feedback'} title={feedbackSent ? '✓ Feedback sent!' : 'Send Feedback'} onClose={() => setModal(null)}>
        {!feedbackSent && (
          <>
            <Text className="text-white/40 text-sm mb-4" style={{ lineHeight: 20 }}>
              Tell us what you love, what's broken, or what you'd like to see next.
            </Text>
            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="Your feedback…"
              placeholderTextColor="#333333"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="text-white text-sm px-4 py-3 mb-4"
              style={{ minHeight: 100, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)' }}
            />
            {!!feedbackError && <Text className="text-red-400 text-xs mb-4">{feedbackError}</Text>}
            <Pressable
              onPress={sendFeedback}
              disabled={!feedbackText.trim() || feedbackSending}
              className="w-full py-[14px] rounded-2xl items-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.14)', opacity: !feedbackText.trim() || feedbackSending ? 0.3 : 1 }}
            >
              <Text className="text-white text-sm font-semibold">{feedbackSending ? 'Sending…' : 'Send'}</Text>
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
          <Text className="text-white/40 text-sm text-center">Built this app to make personal finance simple, beautiful, and private.</Text>
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
