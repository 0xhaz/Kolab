import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { CampaignDto } from '@kolab/shared';
import { CampaignCover, CampaignFeedCard, payout } from '@/components/campaign';
import { Segmented } from '@/components/segmented';
import { Card, Screen, SlotStrip } from '@/components/ui';
import { useCampaigns, useMyEnrollments } from '@/lib/queries';
import { usdc } from '@/lib/format';
import { c, font } from '@/lib/theme';

/** Kept for screens that still import it. */
export const payoutLine = (camp: CampaignDto) => {
  const p = payout(camp);
  return `${p.amount} · ${p.detail}`;
};

export default function Discover() {
  const campaigns = useCampaigns();
  const mine = useMyEnrollments();
  const [tab, setTab] = useState<'discover' | 'joined'>('discover');
  const joined = mine.data ?? [];
  const joinedIds = new Set(joined.map((e) => e.campaignId));
  const open = (campaigns.data ?? []).filter((cp) => cp.status === 'active' && !joinedIds.has(cp.id));

  return (
    <Screen
      title="Discover"
      refreshing={campaigns.isRefetching || mine.isRefetching}
      onRefresh={() => {
        void campaigns.refetch();
        void mine.refetch();
      }}
    >
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'discover', label: `For you${open.length ? ` · ${open.length}` : ''}` },
          { value: 'joined', label: `Joined${joined.length ? ` · ${joined.length}` : ''}` },
        ]}
      />

      {tab === 'discover' &&
        (open.length === 0 ? (
          <Card style={styles.empty}>
            <SymbolView name="sparkles" tintColor={c.primary} size={28} />
            <Text style={styles.emptyText}>{campaigns.isLoading ? 'Loading…' : 'No open campaigns right now. Brands can also send you a join link.'}</Text>
          </Card>
        ) : (
          open.map((cp) => <CampaignFeedCard key={cp.id} camp={cp} onPress={() => router.push({ pathname: '/campaign/[id]', params: { id: cp.id } })} />)
        ))}

      {tab === 'joined' &&
        (joined.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyText}>You haven’t joined a campaign yet.</Text>
          </Card>
        ) : (
          joined.map((e) => (
            <Card key={e.id} onPress={() => router.push({ pathname: '/enrollment/[id]', params: { id: e.id } })} style={{ gap: 12 }}>
              <View style={styles.joinedRow}>
                <View style={{ width: 64 }}>
                  <CampaignCover camp={e.campaign} height={64} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.brand}>{e.campaign.brandName ?? 'Brand'}</Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {e.campaign.title}
                  </Text>
                </View>
                <Text style={styles.earned}>{usdc(e.earnedTotal, 0)}</Text>
              </View>
              {e.slots.length > 0 ? (
                <SlotStrip statuses={e.slots.map((s) => s.status)} />
              ) : (
                <Text style={styles.voucher}>Voucher {e.voucherCode} · {usdc(e.salesAccrued)} to claim</Text>
              )}
            </Card>
          ))
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyText: { color: c.muted, fontSize: 15, textAlign: 'center' },
  joinedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { color: c.muted, fontSize: 13, fontFamily: font.medium },
  title: { color: c.foreground, fontSize: 16, fontFamily: font.semibold },
  earned: { color: c.money, fontFamily: font.display, fontSize: 18 },
  voucher: { color: c.muted, fontSize: 13 },
});
