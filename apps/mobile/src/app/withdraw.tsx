import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Glass, failure, success } from '@/components/ui';
import { useToast } from '@/components/toast';
import { cashoutKeys, useWalletBalance } from '@/lib/cashout';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { errorMessage } from '@/lib/errors';
import { usdc } from '@/lib/format';
import { c, font, ui } from '@/lib/theme';

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Send USDC from the Kolab wallet to any Solana address (e.g. an exchange deposit address). */
export default function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const balance = useWalletBalance();
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const available = balance.data ? Number(balance.data.usdc) / 1e6 : 0;
  const value = Number(amount);
  const addressOk = SOLANA_ADDRESS.test(to.trim());
  const ok = addressOk && value > 0 && value <= available;

  async function withdraw() {
    setBusy(true);
    try {
      await send('/tx/withdraw', { to: to.trim(), amountUsdc: value });
      await qc.invalidateQueries({ queryKey: cashoutKeys.balance });
      success();
      toast(`${usdc(value)} sent`, 'success');
      router.back();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 60, paddingBottom: 140, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 10 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Amount (USDC)</Text>
            <Pressable onPress={() => setAmount(String(available))} hitSlop={8}>
              <Text style={styles.link}>Max {usdc(available)}</Text>
            </Pressable>
          </View>
          <TextInput style={[ui.input, styles.amount]} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.faint} />
          {value > available && <Text style={styles.error}>More than your wallet holds.</Text>}
        </Card>
        <Card style={{ gap: 10 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Solana address</Text>
            <Pressable
              onPress={async () => {
                const text = await Clipboard.getStringAsync();
                if (text) setTo(text.trim());
              }}
              hitSlop={8}
            >
              <Text style={styles.link}>Paste</Text>
            </Pressable>
          </View>
          <TextInput style={[ui.input, { fontSize: 13 }]} value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} placeholder="Your wallet or exchange USDC (Solana) address" placeholderTextColor={c.faint} />
          {to.length > 6 && !addressOk && <Text style={styles.error}>That doesn’t look like a Solana address.</Text>}
          <Text style={styles.hint}>Sends USDC on Solana. Check that the receiving wallet or exchange supports USDC on Solana; transfers can’t be reversed. Kolab pays the network fee.</Text>
        </Card>
      </ScrollView>
      <Glass style={[styles.cta, { bottom: insets.bottom + 8 }]}>
        <Button label={busy ? 'Confirm in your wallet…' : `Withdraw ${value > 0 ? usdc(value) : ''}`} icon="arrow.up.circle" busy={busy} disabled={!ok} onPress={withdraw} />
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  link: { color: c.accent, fontFamily: font.semibold, fontSize: 13 },
  hint: { color: c.faint, fontSize: 12, lineHeight: 17 },
  error: { color: c.danger, fontSize: 13 },
  amount: { fontSize: 28, fontFamily: font.display },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cta: { position: 'absolute', left: 16, right: 16, padding: 8, borderRadius: 999 },
});
