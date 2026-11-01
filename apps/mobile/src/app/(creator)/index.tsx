import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { CampaignCover, CampaignRailCard } from '@/components/campaign';
import { CreatorKitCard } from '@/components/creator-kit-card';
import { Avatar, Card, PressableScale, Screen, SectionHeader, SlotPill } from '@/components/ui';
import { useClaimCreatorRole, useMe } from '@/lib/use-me';
import { useCampaigns, useMyEnrollments } from '@/lib/queries';
import { slotTitle, slotsNeedingWork, summarize } from '@/lib/earnings';
import { firstName, greeting } from '@/lib/greeting';
import { local, relative, usdc } from '@/lib/format';
import { c, font, gradients, radius } from '@/lib/theme';

export default function Home() {
  const { data: me } = useMe();
  useClaimCreatorRole();
  const q = useMyEnrollments();
  const campaigns = useCampaigns();
  const enrollments = q.data ?? [];
  const totals = summarize(enrollments);
  const todo = slotsNeedingWork(enrollments);
  const joined = new Set(enrollments.map((e) => e.campaignId));
  const open = (campaigns.data ?? []).filter((cp) => cp.status === 'active' && !joined.has(cp.id));
  const name = firstName(me?.displayName, me?.email);

  const actions = enrollments.filter(
    (e) => (e.campaign.requiresShipping && e.status === 'awaiting_shipment' && !e.hasAddress) || e.status === 'in_transit',
  );
  const inReview = enrollments.flatMap((e) => e.slots.filter((s) => s.status === 'submitted').map((slot) => ({ slot, e })));

  return (
    <Screen
      subtitle={`${greeting()},`}
      title={name}
      right={
        <PressableScale onPress={() => router.navigate('/profile')}>
          <Avatar name={me?.displayName ?? me?.email ?? name} size={46} ring />
        </PressableScale>
      }
      refreshing={q.isRefetching}
      onRefresh={() => {
        void q.refetch();
        void campaigns.refetch();
      }}
    >
      <PressableScale onPress={() => router.navigate('/earnings')}>
        <LinearGradient colors={gradients.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroBlob} />
          <Text style={styles.heroLabel}>Earned on Kolab</Text>
          <Text style={styles.heroValue}>{usdc(totals.paid)}</Text>
          <Text style={styles.heroLocal}>{local(totals.paid)}</Text>
          <View style={styles.heroStats}>
            {[
              ['Held back', totals.holdbackPending],
              ['To claim', totals.salesToClaim],
              ['Still to earn', totals.upcoming],
            ].map(([label, v]) => (
              <View key={label as string} style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{usdc(v as bigint, 0)}</Text>
                <Text style={styles.heroStatLabel}>{label as string}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </PressableScale>

      <CreatorKitCard enrollments={enrollments} />

      {me?.role === 'brand' && (
        <Card>
          <Text style={{ color: c.warning }}>This account can’t be used in the creator app. Sign in with a creator email.</Text>
        </Card>
      )}

      {actions.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Needs you" />
          {actions.map((e) => (
            <Card key={e.id} onPress={() => router.push({ pathname: '/enrollment/[id]', params: { id: e.id } })} style={styles.action}>
              <View style={[styles.actionIcon, { backgroundColor: e.status === 'in_transit' ? '#0EA5E933' : '#F59E0B33' }]}>
                <SymbolView name={e.status === 'in_transit' ? 'shippingbox.fill' : 'mappin.and.ellipse'} tintColor={e.status === 'in_transit' ? '#38BDF8' : c.warning} size={20} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.actionTitle}>{e.status === 'in_transit' ? 'Your product is on the way' : 'Add your shipping address'}</Text>
                <Text style={styles.actionSub} numberOfLines={1}>
                  {e.status === 'in_transit' ? 'Tap “Received” when it arrives' : e.campaign.brandName ?? e.campaign.title}
                </Text>
              </View>
              <SymbolView name="chevron.right" tintColor={c.faint} size={14} />
            </Card>
          ))}
        </View>
      )}

      <View style={{ gap: 10 }}>
        <SectionHeader title="Up next" />
        {todo.length === 0 ? (
          <Card style={styles.emptyCard}>
            <SymbolView name="checkmark.circle" tintColor={c.money} size={28} />
            <Text style={styles.emptyText}>{enrollments.length ? 'You’re all caught up.' : 'Join a campaign to start earning.'}</Text>
          </Card>
        ) : (
          todo.slice(0, 4).map(({ slot, enrollment }) => (
            <Card key={slot.id} onPress={() => router.push({ pathname: '/slot/[id]', params: { id: slot.id } })} style={styles.todo}>
              <View style={{ width: 56 }}>
                <CampaignCover camp={enrollment.campaign} height={56} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.todoTitle}>{slotTitle(slot)}</Text>
                <Text style={styles.actionSub} numberOfLines={1}>
                  {enrollment.campaign.brandName ?? enrollment.campaign.title}
                </Text>
                <SlotPill status={slot.status} />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.todoAmount}>{usdc(slot.amount, 0)}</Text>
                <Text style={styles.due}>due {relative(slot.dueAt)}</Text>
              </View>
            </Card>
          ))
        )}
      </View>

      {inReview.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="With the brand" />
          {inReview.map(({ slot, e }) => (
            <Card key={slot.id} onPress={() => router.push({ pathname: '/slot/[id]', params: { id: slot.id } })} style={styles.action}>
              <View style={[styles.actionIcon, { backgroundColor: '#818CF833' }]}>
                <SymbolView name="hourglass" tintColor="#A5B4FC" size={20} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.actionTitle}>
                  {slotTitle(slot)} · {e.campaign.brandName ?? 'Brand'}
                </Text>
                <Text style={styles.actionSub}>
                  {slot.checks === 'passed' ? 'Checks passed · ' : slot.checks === 'failed' ? 'Checks flagged · ' : ''}auto-paid if no reply
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      {open.length > 0 && (
        <View style={{ gap: 12 }}>
          <SectionHeader title="Brands looking for you" action="See all" onAction={() => router.navigate('/campaigns')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginRight: -20 }}>
            {open.map((cp) => (
              <CampaignRailCard key={cp.id} camp={cp} onPress={() => router.push({ pathname: '/campaign/[id]', params: { id: cp.id } })} />
            ))}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 22, gap: 2, overflow: 'hidden' },
  heroBlob: { position: 'absolute', width: 260, height: 260, borderRadius: 130, right: -80, top: -110, backgroundColor: 'rgba(255,255,255,0.16)' },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontFamily: font.medium, fontSize: 14 },
  heroValue: { color: '#fff', fontFamily: font.display, fontSize: 42, letterSpacing: -1.2, marginTop: 2 },
  heroLocal: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 18 },
  heroStat: { flex: 1, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  heroStatValue: { color: '#fff', fontFamily: font.semibold, fontSize: 16 },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  actionSub: { color: c.muted, fontSize: 13 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  todoTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 16 },
  todoAmount: { color: c.money, fontFamily: font.display, fontSize: 18 },
  due: { color: c.muted, fontSize: 12 },
  emptyCard: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { color: c.muted, fontSize: 15 },
});
