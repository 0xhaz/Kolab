import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useLoginWithEmail } from '@privy-io/expo';
import { Button, Glass, failure } from '@/components/ui';
import { c, font, ui } from '@/lib/theme';

const POINTS = [
  { icon: 'lock.shield.fill', text: 'Money locked before you start' },
  { icon: 'bolt.fill', text: 'Auto-paid if the brand goes quiet' },
  { icon: 'percent', text: 'Keep 100% of your rate' },
] as const;

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { state, sendCode, loginWithCode } = useLoginWithEmail({ onError: (e) => setError(e.message) });

  const codeSent = state.status === 'awaiting-code-input' || state.status === 'submitting-code';
  const busy = state.status === 'sending-code' || state.status === 'submitting-code';

  async function submit() {
    setError(null);
    try {
      if (!codeSent) await sendCode({ email: email.trim() });
      else await loginWithCode({ code: code.trim(), email: email.trim() });
    } catch (e) {
      failure();
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <LinearGradient colors={['#5B21B6', '#BE185D', 'rgba(7,7,11,0)']} locations={[0, 0.35, 0.75]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior="padding" style={styles.wrap}>
          <View style={{ gap: 14 }}>
            <Text style={styles.wordmark}>kolab</Text>
            <Text style={styles.hero}>Get paid for the posts you already love making.</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {POINTS.map((p) => (
                <View key={p.text} style={styles.point}>
                  <View style={styles.pointIcon}>
                    <SymbolView name={p.icon} tintColor="#fff" size={14} />
                  </View>
                  <Text style={styles.pointText}>{p.text}</Text>
                </View>
              ))}
            </View>
          </View>

          <Glass style={{ gap: 12, padding: 18 }}>
            <Text style={styles.cardTitle}>{codeSent ? 'Check your email' : 'Sign in or create an account'}</Text>
            <TextInput
              style={ui.input}
              placeholder="you@example.com"
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!codeSent}
              value={email}
              onChangeText={setEmail}
            />
            {codeSent && (
              <TextInput
                style={[ui.input, { letterSpacing: 8, fontSize: 22, textAlign: 'center', fontFamily: font.semibold }]}
                placeholder="••••••"
                placeholderTextColor={c.faint}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
            )}
            {error && <Text style={ui.error}>{error}</Text>}
            <Button label={codeSent ? 'Sign in' : 'Continue with email'} busy={busy} disabled={!email} onPress={submit} />
            <Text style={styles.fine}>We create a Solana wallet for you. No seed phrase, no crypto needed.</Text>
          </Glass>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'space-between' },
  wordmark: { color: '#fff', fontFamily: font.display, fontSize: 28, letterSpacing: -0.5, marginTop: 24 },
  hero: { color: '#fff', fontFamily: font.display, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  pointText: { color: 'rgba(255,255,255,0.92)', fontFamily: font.medium, fontSize: 16 },
  cardTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 17 },
  fine: { color: c.muted, fontSize: 12, textAlign: 'center' },
});
