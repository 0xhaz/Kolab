import { useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { CASHOUT_DESTINATIONS, isValidAddress, type CashoutQuoteDto, type CashoutStatus, type FundingChain } from '@kolab/shared';
import { Button, Card, Chip, Glass, failure, success, tap } from '@/components/ui';
import { useToast } from '@/components/toast';
import { cashoutKeys, useCashout, useCashoutApi, useWalletBalance } from '@/lib/cashout';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { errorMessage } from '@/lib/errors';
import { usdc } from '@/lib/format';
import { features } from '@/lib/env';
import { c, font, radius, ui } from '@/lib/theme';

const STEPS: { status: CashoutStatus; label: string; sub: string }[] = [
  { status: 'awaiting_signature', label: 'Confirm in your wallet', sub: 'Kolab pays the network fee' },
  { status: 'deposit_sent', label: 'USDC sent', sub: 'On its way to Aurora Intents' },
  { status: 'swapping', label: 'Swapping', sub: 'Routed by Aurora (NEAR Intents)' },
  { status: 'completed', label: 'Delivered', sub: 'Arrived at your address' },
];
const ORDER = STEPS.map((s) => s.status);
const chainOf = (chain: FundingChain) => CASHOUT_DESTINATIONS.find((d) => d.chain === chain)!;
const eta = (secs: number) => (secs < 90 ? `~${secs}s` : `~${Math.round(secs / 60)} min`);

function Progress({ id }: { id: string }) {
  const { data: o } = useCashout(id);
  const qc = useQueryClient();
  const done = o?.status === 'completed';
  useEffect(() => {
    if (done) {
      success();
      void qc.invalidateQueries({ queryKey: cashoutKeys.balance });
      void qc.invalidateQueries({ queryKey: cashoutKeys.list });
    }
  }, [done, qc]);
  if (!o) return null;
  const failed = ['failed', 'refunded', 'expired'].includes(o.status);
  const at = ORDER.indexOf(o.status);
  const dest = chainOf(o.destChain);

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Text style={styles.muted}>
          {usdc(o.amountIn, 2)} → {dest.label}
        </Text>
        <Text style={styles.big}>
          {o.amountOut} {o.destAsset}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          to {o.recipient}
        </Text>
      </View>
      <View>
        {STEPS.map((s, i) => {
          const isDone = at > i || done;
          const isNow = at === i && !done && !failed;
          const color = isDone ? c.money : isNow ? c.accent : c.faint;
          return (
            <View key={s.status} style={styles.step}>
              <View style={[styles.dot, { borderColor: color, backgroundColor: isDone || isNow ? `${color}33` : 'transparent' }]}>
                <SymbolView name={isDone ? 'checkmark' : isNow ? 'circle.fill' : 'circle'} tintColor={color} size={isNow ? 8 : 11} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, !isDone && !isNow && { color: c.muted }]}>{s.label}</Text>
                <Text style={styles.muted}>{s.sub}</Text>
              </View>
            </View>
          );
        })}
      </View>
      {failed && (
        <Text style={{ color: c.danger, fontSize: 14 }}>
          {o.status === 'refunded' ? 'The swap couldn’t complete, so your USDC was refunded to your Kolab wallet.' : o.status === 'expired' ? 'The quote expired. Start again.' : (o.failureReason ?? 'Cash-out failed.')}
        </Text>
      )}
      {o.relayTx && <Button label="Relay’s mainnet transfer" variant="secondary" icon="arrow.up.right" onPress={() => void Linking.openURL(`https://solscan.io/tx/${o.relayTx}`)} />}
      {done && o.destinationExplorerUrl && <Button label="View on explorer" variant="secondary" icon="arrow.up.right" onPress={() => void Linking.openURL(o.destinationExplorerUrl!)} />}
      {done && <Button label="Done" icon="checkmark" onPress={() => router.back()} />}
    </Card>
  );
}

/** Cash out USDC from the Kolab wallet to any chain and asset (Aurora Intents Swap API). */
export default function CashoutScreen() {
  // Store builds don't ship cross-chain swaps; a stale deep link lands on plain withdraw instead.
  if (!features.crossChainCashout) return <Redirect href="/withdraw" />;
  return <Cashout />;
}

function Cashout() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const balance = useWalletBalance();
  const cashoutApi = useCashoutApi();
  const send = useSponsoredTx();
  const available = balance.data ? Number(balance.data.usdc) / 1e6 : 0;

  const [amount, setAmount] = useState('');
  const [chain, setChain] = useState<FundingChain>('tron');
  const [asset, setAsset] = useState('USDT');
  const [recipient, setRecipient] = useState('');
  const [quote, setQuote] = useState<CashoutQuoteDto | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  const value = Number(amount);
  const addressOk = isValidAddress(chain, recipient);
  const amountOk = value >= 1 && value <= available;

  useEffect(() => {
    if (!amountOk || !addressOk || id) return;
    let cancelled = false;
    const t = setTimeout(() => {
      cashoutApi
        .quote({ amountUsdc: value, destChain: chain, destAsset: asset, recipient: recipient.trim() })
        .then((q) => !cancelled && setQuote(q))
        .catch(() => !cancelled && setQuote(null));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, chain, asset, recipient, amountOk, addressOk, id]);

  async function cashOut() {
    try {
      setStage('Getting a fresh quote…');
      const o = await cashoutApi.create({ amountUsdc: value, destChain: chain, destAsset: asset, recipient: recipient.trim() });
      setStage('Confirm in your wallet…');
      const tx = await send(`/cashouts/${o.id}/tx`, {});
      await cashoutApi.sent(o.id, tx.signature);
      setId(o.id);
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setStage(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 60, paddingBottom: 140, gap: 16 }} keyboardShouldPersistTaps="handled">
        {id ? (
          <Progress id={id} />
        ) : (
          <>
            <Card style={{ gap: 10 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>Amount (USDC)</Text>
                <Pressable onPress={() => setAmount(String(Math.floor(available * 100) / 100))} hitSlop={8}>
                  <Text style={styles.max}>Max {usdc(BigInt(balance.data?.usdc ?? 0), 2)}</Text>
                </Pressable>
              </View>
              <TextInput style={[ui.input, styles.amount]} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.faint} />
              {value > available && <Text style={{ color: c.danger, fontSize: 13 }}>More than your wallet holds.</Text>}
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={styles.label}>Receive on</Text>
              <View style={styles.grid}>
                {CASHOUT_DESTINATIONS.map((d) => (
                  <Pressable
                    key={d.chain}
                    onPress={() => {
                      tap();
                      setChain(d.chain);
                      setAsset(d.assets[0]);
                    }}
                    style={[styles.chain, chain === d.chain && styles.chainOn]}
                  >
                    <View style={[styles.chainDot, { backgroundColor: d.color }]} />
                    <Text style={styles.chainText}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={[styles.grid, { gap: 6 }]}>
                {chainOf(chain).assets.map((a) => (
                  <Pressable key={a} onPress={() => setAsset(a)}>
                    <Chip label={a} color={asset === a ? c.accent : c.muted} />
                  </Pressable>
                ))}
              </View>
            </Card>

            <Card style={{ gap: 10 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>Your {chainOf(chain).label} address</Text>
                <Pressable
                  onPress={async () => {
                    const text = await Clipboard.getStringAsync();
                    if (text) setRecipient(text.trim());
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.max}>Paste</Text>
                </Pressable>
              </View>
              <TextInput
                style={[ui.input, { fontSize: 13 }]}
                value={recipient}
                onChangeText={setRecipient}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={chain === 'tron' ? 'T…' : chain === 'btc' ? 'bc1…' : chain === 'near' ? 'you.near' : chain === 'ton' ? 'UQ…' : chain === 'sol' ? 'Solana address' : '0x…'}
                placeholderTextColor={c.faint}
              />
              {recipient.length > 6 && !addressOk && <Text style={{ color: c.danger, fontSize: 13 }}>That doesn’t look like a {chainOf(chain).label} address.</Text>}
              <Text style={styles.hint}>Double-check it: crypto sent to a wrong address can’t be recovered.</Text>
            </Card>

            {quote && amountOk && addressOk && (
              <Card style={{ gap: 6 }}>
                <Text style={styles.muted}>You receive about</Text>
                <Text style={styles.big}>
                  {quote.amountOut} {quote.destAsset}
                </Text>
                <Text style={styles.muted}>
                  ≈ ${quote.amountOutUsd.toFixed(2)} · {eta(quote.estimatedSecs)} · includes {quote.appFeeBps / 100}% fee · powered by Aurora Intents
                </Text>
                {quote.mode === 'simulated' && <Chip label="Devnet: swap is simulated, the USDC transfer is real" color={c.warning} icon="flask" />}
                {quote.mode === 'hybrid' && <Chip label="Live Aurora payout on mainnet, paid by Kolab’s relay" color={c.money} icon="globe" />}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {!id && (
        <Glass style={[styles.cta, { bottom: insets.bottom + 8 }]}>
          <Button label={stage ?? `Cash out ${value > 0 ? usdc(value, 2) : ''}`} icon="arrow.up.forward.circle" busy={!!stage} disabled={!quote || !amountOk || !addressOk} onPress={cashOut} />
        </Glass>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  muted: { color: c.muted, fontSize: 13 },
  hint: { color: c.faint, fontSize: 12 },
  max: { color: c.accent, fontFamily: font.semibold, fontSize: 13 },
  big: { color: c.money, fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 },
  amount: { fontSize: 28, fontFamily: font.display },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chain: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised },
  chainOn: { borderColor: c.accent, backgroundColor: `${c.accent}1A` },
  chainDot: { width: 8, height: 8, borderRadius: 4 },
  chainText: { color: c.foreground, fontFamily: font.medium, fontSize: 14 },
  step: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  cta: { position: 'absolute', left: 16, right: 16, padding: 8, borderRadius: 999 },
});
