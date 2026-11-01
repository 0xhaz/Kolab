import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CampaignCover } from '@/components/campaign';
import { Button, Card, Screen, SectionHeader, failure, success } from '@/components/ui';
import { useToast } from '@/components/toast';
import { keys, useMyEnrollments } from '@/lib/queries';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { errorMessage } from '@/lib/errors';
import { summarize } from '@/lib/earnings';
import { local, usdc } from '@/lib/format';
import { useCashouts, useWalletBalance } from '@/lib/cashout';
import { features } from '@/lib/env';
import { c, font, gradients } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';

const BUCKETS = [
  { key: 'paid', label: 'Paid to you', color: c.money },
  { key: 'holdbackPending', label: 'Held until posts stay live', color: '#A78BFA' },
  { key: 'salesToClaim', label: 'Sales to claim', color: '#F472B6' },
  { key: 'upcoming', label: 'Locked for upcoming work', color: '#475569' },
] as const;

export default function Earnings() {
  const q = useMyEnrollments();
  const wallet = useWalletBalance();
  const cashouts = useCashouts();
  const enrollments = q.data ?? [];
  const totals = summarize(enrollments);
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const toast = useToast();
  const [claiming, setClaiming] = useState<string | null>(null);
  const all = BUCKETS.reduce((s, b) => s + totals[b.key], 0n);

  async function claim(enrollmentId: string) {
    setClaiming(enrollmentId);
    try {
      await send(`/enrollments/${enrollmentId}/tx/claim-sales`, {});
      await qc.invalidateQueries({ queryKey: keys.enrollments });
      success();
      toast('Sales payout sent to your wallet', 'success');
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setClaiming(null);
    }
  }

  return (
    <Screen title="Earnings" refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={{ gap: 4 }}>
        <Text style={styles.heroLabel}>Paid to your wallet</Text>
        <Text style={styles.hero}>{usdc(totals.paid)}</Text>
        <Text style={styles.heroSub}>
          {local(totals.paid)} · {local(totals.paid, 'IDR')}
        </Text>
      </View>

      <Card style={{ gap: 14 }}>
        <Text style={styles.cardTitle}>Where your money is</Text>
        <View style={styles.bar}>
          {all === 0n ? (
            <View style={{ flex: 1, backgroundColor: c.surfaceRaised }} />
          ) : (
            BUCKETS.filter((b) => totals[b.key] > 0n).map((b) => (
              <View key={b.key} style={{ flex: Number((totals[b.key] * 1000n) / all), backgroundColor: b.color }} />
            ))
          )}
        </View>
        {BUCKETS.map((b) => (
          <View key={b.key} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: b.color }]} />
            <Text style={styles.legendLabel}>{b.label}</Text>
            <Text style={styles.legendValue}>{usdc(totals[b.key])}</Text>
          </View>
        ))}
      </Card>

      {features.crossChainCashout && (
      <Card onPress={() => router.push('/cashout')} style={styles.cashout}>
        <LinearGradient colors={gradients.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cashoutIcon}>
          <SymbolView name="arrow.up.forward.circle.fill" tintColor="#fff" size={22} />
        </LinearGradient>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardTitle}>Cash out to any chain</Text>
          <Text style={styles.legendLabel}>
            {wallet.data ? `${usdc(wallet.data.usdc)} in your wallet · ` : ''}USDT on Tron, BNB, TON and more
          </Text>
        </View>
        <SymbolView name="chevron.right" tintColor={c.faint} size={14} />
      </Card>
      )}

      <Card onPress={() => router.push('/withdraw')} style={styles.cashout}>
        <View style={[styles.cashoutIcon, { backgroundColor: c.surfaceRaised }]}>
          <SymbolView name="arrow.up.circle" tintColor={c.foreground} size={22} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardTitle}>Withdraw USDC</Text>
          <Text style={styles.legendLabel}>To your own wallet or exchange on Solana</Text>
        </View>
        <SymbolView name="chevron.right" tintColor={c.faint} size={14} />
      </Card>

      {features.crossChainCashout && (cashouts.data ?? []).length > 0 && (
        <Card style={{ gap: 10 }}>
          <Text style={styles.cardTitle}>Recent cash-outs</Text>
          {(cashouts.data ?? []).slice(0, 3).map((o) => (
            <View key={o.id} style={styles.legendRow}>
              <Text style={[styles.legendLabel, { flex: 1 }]} numberOfLines={1}>
                {usdc(o.amountIn, 0)} → {o.amountOut} {o.destAsset}
              </Text>
              <Text style={[styles.legendValue, { color: o.status === 'completed' ? c.money : o.status === 'failed' || o.status === 'refunded' ? c.danger : c.muted }]}>
                {o.status === 'completed' ? 'Delivered' : o.status === 'refunded' ? 'Refunded' : o.status === 'failed' ? 'Failed' : o.status === 'expired' ? 'Expired' : 'In progress'}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.note}>
        <Text style={styles.noteText}>You keep 100% of your rate. Kolab charges brands, not creators.</Text>
      </Card>

      <View style={{ gap: 12 }}>
        <SectionHeader title="By campaign" />
        {enrollments.length === 0 && (
          <Card>
            <Text style={{ color: c.muted }}>Join a campaign to start earning.</Text>
          </Card>
        )}
        {enrollments.map((e) => (
          <Card key={e.id} onPress={() => router.push({ pathname: '/enrollment/[id]', params: { id: e.id } })} style={{ gap: 12 }}>
            <View style={styles.row}>
              <View style={{ width: 48 }}>
                <CampaignCover camp={e.campaign} height={48} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.brand}>{e.campaign.brandName ?? 'Brand'}</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {e.campaign.title}
                </Text>
              </View>
              <Text style={styles.amount}>{usdc(e.earnedTotal, 0)}</Text>
            </View>
            {e.campaign.type === 'per_sale' && BigInt(e.salesAccrued) > 0n && (
              <Button label={`Claim ${usdc(e.salesAccrued)}`} busy={claiming === e.id} onPress={() => claim(e.id)} />
            )}
          </Card>
        ))}
      </View>

      <Text style={styles.fine}>Cash-out to MYR / IDR runs through a licensed partner (coming soon). Local amounts are estimates.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cashout: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cashoutIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { color: c.muted, fontFamily: font.medium, fontSize: 14 },
  hero: { color: c.foreground, fontFamily: font.display, fontSize: 46, letterSpacing: -1.4 },
  heroSub: { color: c.muted, fontSize: 14 },
  cardTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 16 },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1, color: c.muted, fontSize: 14 },
  legendValue: { color: c.foreground, fontFamily: font.semibold, fontSize: 14 },
  note: { backgroundColor: `${c.money}14`, borderColor: `${c.money}44` },
  noteText: { color: c.money, fontFamily: font.medium, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { color: c.muted, fontSize: 13 },
  title: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  amount: { color: c.money, fontFamily: font.display, fontSize: 18 },
  fine: { color: c.faint, fontSize: 12, textAlign: 'center' },
});

