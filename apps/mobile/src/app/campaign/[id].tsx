import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { CampaignCover, KitBadge, TYPE_LABEL, payout } from '@/components/campaign';
import { BrandKitLocked, BrandKitSection } from '@/components/brand-kit-section';
import { Avatar, Button, Card, Chip, Glass, SectionHeader, Stat, failure, success } from '@/components/ui';
import { useToast } from '@/components/toast';
import { keys, useCampaign } from '@/lib/queries';
import { useBrandReputation, useMyApplication } from '@/lib/profile';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { errorMessage } from '@/lib/errors';
import { local, usdc } from '@/lib/format';
import { c, font } from '@/lib/theme';
import type { ApplicationStatus } from '@kolab/shared';

const hours = (secs: number) => (secs < 3600 ? `${Math.round(secs / 60)} min` : `${Math.round(secs / 3600)}h`);
const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

const APPLICATION: Record<ApplicationStatus, { icon: SymbolViewProps['name']; color: string; title: string; body: string }> = {
  pending: { icon: 'hourglass', color: '#818CF8', title: 'Application sent · the brand is reviewing', body: 'You’ll get a notification as soon as they decide.' },
  declined: { icon: 'xmark.circle', color: c.muted, title: 'Not selected this time', body: 'Brands often pick for one niche. Polish your profile and you can apply again.' },
  accepted: { icon: 'checkmark.seal.fill', color: c.money, title: 'You’re in!', body: 'The brand approved you on-chain. Join to lock your pay in escrow.' },
};

function ApplicationCard({ status }: { status: ApplicationStatus }) {
  const a = APPLICATION[status];
  return (
    <Card style={{ borderColor: `${a.color}55`, backgroundColor: status === 'accepted' ? `${c.money}14` : c.surface }}>
      <Rule icon={a.icon} color={a.color} title={a.title} body={a.body} />
    </Card>
  );
}

/** Brand track record from on-chain outcomes of its campaigns. */
function AboutBrand({ campaignId }: { campaignId: string }) {
  const { data: rep } = useBrandReputation(campaignId);
  if (!rep) return null;
  const isNew = rep.campaigns <= 1 && rep.creatorsPaid === 0;
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="About the brand" />
      <Card style={{ gap: 14 }}>
        {isNew ? (
          <Rule icon="sparkle" color={c.primary} title="New on Kolab" body="No paid campaigns yet. Your pay is still locked in escrow before you start." />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Stat label="creators paid" value={String(rep.creatorsPaid)} />
              <Stat label="paid out" value={usdc(rep.paidOut, 0).replace(' USDC', '')} tone="money" />
              <Stat label="decides on time" value={pct(rep.decidedInTimeRate)} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Stat label="avg decision" value={rep.avgDecisionHours === null ? '—' : `${Math.round(rep.avgDecisionHours)}h`} />
              <Stat label="rejection rate" value={pct(rep.rejectionRate)} />
              <Stat label="campaigns" value={String(rep.campaigns)} />
            </View>
          </>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SymbolView name="link" tintColor={c.faint} size={11} />
          <Text style={{ color: c.faint, fontSize: 12 }}>From on-chain payouts</Text>
        </View>
      </Card>
    </View>
  );
}

function Rule({ icon, color, title, body }: { icon: SymbolViewProps['name']; color: string; title: string; body: string }) {
  return (
    <View style={styles.rule}>
      <View style={[styles.ruleIcon, { backgroundColor: `${color}22` }]}>
        <SymbolView name={icon} tintColor={color} size={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleBody}>{body}</Text>
      </View>
    </View>
  );
}

/** Opened from Discover or a join link: kolab://campaign/<id>. */
export default function CampaignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const q = useCampaign(id);
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const camp = q.data;
  const mine = camp?.enrollments[0];
  // Selective campaigns: the brand approves applicants on-chain before they can join.
  const application = useMyApplication(id, !!camp?.selective && !mine);
  const status = application.data?.status;

  async function join() {
    setBusy(true);
    try {
      await send(`/campaigns/${id}/tx/enroll`, {});
      await qc.invalidateQueries({ queryKey: keys.enrollments });
      const fresh = await q.refetch();
      success();
      toast('You’re in! Your pay is locked in escrow.', 'success');
      const enrollment = fresh.data?.enrollments[0];
      if (enrollment) router.replace({ pathname: '/enrollment/[id]', params: { id: enrollment.id } });
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!camp) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, padding: 20, paddingTop: insets.top + 60 }}>
        <Text style={{ color: c.muted }}>{q.isError ? errorMessage(q.error) : 'Loading…'}</Text>
      </View>
    );
  }

  const p = payout(camp);
  const holdbackPct = camp.holdbackBps / 100;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <CampaignCover camp={camp} height={340 + insets.top} rounded={false}>
          <View style={styles.coverContent}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip label={TYPE_LABEL[camp.type]} color="#FFFFFF" />
              {camp.requiresShipping && <Chip label="Free product" color="#FFFFFF" icon="gift.fill" />}
              <KitBadge camp={camp} light />
              <Chip
                label={camp.selective ? 'Selective · apply to join' : 'Open · join now'}
                color="#FFFFFF"
                icon={camp.selective ? 'person.crop.circle.badge.checkmark' : 'bolt.fill'}
              />
            </View>
            <View style={styles.brandRow}>
              <Avatar name={camp.brandName ?? 'Brand'} size={32} />
              <Text style={styles.brand}>{camp.brandName ?? 'Brand'}</Text>
              <SymbolView name="checkmark.seal.fill" tintColor="#7DD3FC" size={15} />
            </View>
            <Text style={styles.title}>{camp.title}</Text>
          </View>
        </CampaignCover>

        <View style={styles.body}>
          <Card style={{ flexDirection: 'row', gap: 12 }}>
            <Stat label={p.detail} value={p.amount} tone="money" />
            <Stat label="local estimate" value={local(camp.type === 'per_sale' ? camp.perSaleAmount : camp.slots.reduce((s, x) => s + BigInt(x.amount), 0n)).replace('≈ ', '')} />
          </Card>

          {!mine && status && <ApplicationCard status={status} />}

          {mine ? <BrandKitSection camp={camp} enrollmentId={mine.id} /> : <BrandKitLocked camp={camp} />}

          {camp.briefMd ? (
            <View style={{ gap: 10 }}>
              <SectionHeader title="The brief" />
              <Text style={styles.brief}>{camp.briefMd}</Text>
            </View>
          ) : null}

          {camp.slots.length > 0 && (
            <View style={{ gap: 12 }}>
              <SectionHeader title="Deliverables" />
              <Card style={{ gap: 0, paddingVertical: 8 }}>
                {camp.slots.map((sl, i) => (
                  <View key={i} style={styles.step}>
                    <View style={styles.stepRail}>
                      <View style={styles.stepDot} />
                      {i < camp.slots.length - 1 && <View style={styles.stepLine} />}
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={styles.stepTitle}>
                        {sl.kind === 'ugc' ? 'UGC video' : 'Post'} #{i + 1}
                      </Text>
                      <Text style={styles.stepSub}>
                        Day {Math.round(sl.dueOffsetSecs / 86400)}
                        {camp.requiresShipping ? ' after the product arrives' : ''}
                      </Text>
                    </View>
                    <Text style={styles.stepAmount}>{usdc(sl.amount, 0)}</Text>
                  </View>
                ))}
              </Card>
            </View>
          )}

          <AboutBrand campaignId={camp.id} />

          <View style={{ gap: 12 }}>
            <SectionHeader title="How you get paid" />
            <Card style={{ gap: 16 }}>
              <Rule icon="lock.shield.fill" color={c.money} title="Locked before you start" body="The brand’s budget sits in on-chain escrow, so the money already exists." />
              {camp.type !== 'per_sale' ? (
                <>
                  <Rule
                    icon="checkmark.circle.fill"
                    color={c.primary}
                    title={`${100 - holdbackPct}% on approval${holdbackPct ? `, ${holdbackPct}% after 7 days live` : ''}`}
                    body="Keep your post up and the rest follows automatically."
                  />
                  <Rule icon="bolt.fill" color={c.warning} title={`Auto-paid after ${hours(camp.reviewWindowSecs)}`} body="If the brand doesn’t reply in time, you’re paid anyway." />
                </>
              ) : (
                <Rule icon="tag.fill" color={c.primary} title={`${usdc(camp.perSaleAmount)} per sale`} body="Share your voucher. Each confirmed order adds to what you can claim, any time." />
              )}
              <Rule icon="percent" color={c.accent} title="You keep 100%" body="Kolab’s fee is paid by the brand, never taken from you." />
              {camp.requiresShipping && <Rule icon="shippingbox.fill" color="#38BDF8" title="Product shipped to you" body="Your deadlines only start when you mark it received." />}
            </Card>
          </View>
        </View>
      </ScrollView>

      <Glass style={[styles.cta, { bottom: insets.bottom + 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaAmount}>{p.amount}</Text>
          <Text style={styles.ctaSub}>{p.detail}</Text>
        </View>
        <View style={{ flex: 1.2 }}>
          {mine ? (
            <Button label="Open" icon="arrow.right" onPress={() => router.replace({ pathname: '/enrollment/[id]', params: { id: mine.id } })} />
          ) : !camp.selective || status === 'accepted' ? (
            <Button label="Join" icon="plus" busy={busy} onPress={join} disabled={camp.status !== 'active'} />
          ) : status === 'pending' ? (
            <Button label="In review" icon="hourglass" variant="secondary" disabled onPress={() => {}} />
          ) : (
            <Button
              label={status === 'declined' ? 'Apply again' : 'Apply'}
              icon="paperplane.fill"
              busy={application.isLoading}
              disabled={camp.status !== 'active'}
              onPress={() => router.push({ pathname: '/apply/[id]', params: { id: camp.id } })}
            />
          )}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  coverContent: { position: 'absolute', left: 20, right: 20, bottom: 22, gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: '#fff', fontFamily: font.semibold, fontSize: 15 },
  title: { color: '#fff', fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 },
  body: { padding: 20, gap: 22 },
  brief: { color: c.foreground, fontSize: 16, lineHeight: 24 },
  step: { flexDirection: 'row', alignItems: 'stretch', gap: 12, minHeight: 58 },
  stepRail: { width: 16, alignItems: 'center', paddingTop: 14 },
  stepDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: c.primary, backgroundColor: c.background },
  stepLine: { flex: 1, width: 2, backgroundColor: c.border, marginTop: 4 },
  stepBody: { flex: 1, paddingVertical: 10, gap: 2 },
  stepTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  stepSub: { color: c.muted, fontSize: 13 },
  stepAmount: { color: c.money, fontFamily: font.display, fontSize: 16, paddingTop: 10 },
  rule: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  ruleIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  ruleBody: { color: c.muted, fontSize: 13, lineHeight: 18 },
  cta: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, paddingLeft: 18, borderRadius: 999 },
  ctaAmount: { color: c.foreground, fontFamily: font.display, fontSize: 20 },
  ctaSub: { color: c.muted, fontSize: 12 },
});
