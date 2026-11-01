import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/expo';
import type { DeletionCheckDto } from '@kolab/shared';
import { Button, Card, failure } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useApi } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { c, font, ui } from '@/lib/theme';

const WHAT_GOES = ['Your email login and profile', 'Niches, channels and work samples', 'Shipping addresses and pending applications', 'Your in-app wallet and its keys'];
const WHAT_STAYS = ['Payment records brands rely on (amounts, dates), with no name or email', 'On-chain transactions, which can’t be erased from Solana'];

/** In-app account deletion (App Store 5.1.1(v), Google Play). Refused while money is still involved. */
export default function DeleteAccount() {
  const insets = useSafeAreaInsets();
  const api = useApi();
  const { logout } = usePrivy();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const check = useQuery({ queryKey: ['deletion-check'], queryFn: () => api<DeletionCheckDto>('/me/deletion') });
  const blockers = check.data?.blockers ?? [];

  async function remove() {
    setBusy(true);
    try {
      await api('/me', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
      toast('Your account was deleted', 'success');
      await logout();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Delete your account</Text>
      <Text style={styles.body}>This is permanent. You won’t be able to sign back in to this account or recover its wallet.</Text>

      {blockers.length > 0 && (
        <Card style={{ gap: 10, borderColor: `${c.warning}55` }}>
          <Text style={[styles.h, { color: c.warning }]}>Before you can delete</Text>
          {blockers.map((b) => (
            <View key={b.code} style={styles.row}>
              <SymbolView name="exclamationmark.circle" tintColor={c.warning} size={16} />
              <Text style={[styles.body, { flex: 1 }]}>{b.detail}</Text>
            </View>
          ))}
          {blockers.some((b) => b.code === 'wallet_not_empty') && <Button label="Withdraw my USDC" variant="secondary" icon="arrow.up.circle" onPress={() => router.push('/withdraw')} />}
        </Card>
      )}

      <Card style={{ gap: 8 }}>
        <Text style={styles.h}>What gets deleted</Text>
        {WHAT_GOES.map((t) => (
          <View key={t} style={styles.row}>
            <SymbolView name="trash" tintColor={c.danger} size={14} />
            <Text style={[styles.body, { flex: 1 }]}>{t}</Text>
          </View>
        ))}
        <Text style={[styles.h, { marginTop: 8 }]}>What stays</Text>
        {WHAT_STAYS.map((t) => (
          <View key={t} style={styles.row}>
            <SymbolView name="lock" tintColor={c.muted} size={14} />
            <Text style={[styles.body, { flex: 1 }]}>{t}</Text>
          </View>
        ))}
      </Card>

      {check.data?.canDelete && (
        <Card style={{ gap: 10 }}>
          <Text style={styles.body}>
            Type <Text style={{ fontFamily: font.semibold, color: c.foreground }}>DELETE</Text> to confirm.
          </Text>
          <TextInput style={ui.input} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" placeholderTextColor={c.faint} />
          <Button label={busy ? 'Deleting…' : 'Delete my account'} variant="danger" icon="trash" busy={busy} disabled={confirm !== 'DELETE'} onPress={remove} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: c.foreground, fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 },
  h: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  body: { color: c.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
