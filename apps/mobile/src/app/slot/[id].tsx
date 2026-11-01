import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import type { SlotDto } from '@kolab/shared';
import { CampaignCover } from '@/components/campaign';
import { Button, Card, Glass, SlotPill, slotStyle } from '@/components/ui';
import { useSlot } from '@/lib/queries';
import { slotTitle } from '@/lib/earnings';
import { relative, shortDate, usdc } from '@/lib/format';
import { editorAvailable } from '@/lib/editor';
import { c, font, gradients } from '@/lib/theme';

type StepState = 'done' | 'now' | 'todo' | 'bad';

function steps(slot: SlotDto, reviewEnds: string | null, holdbackPct: number): { title: string; sub?: string; state: StepState }[] {
  const st = slot.status;
  const submitted = st !== 'open' && st !== 'missed';
  const paid = ['released', 'holdback_released', 'holdback_forfeited'].includes(st);
  const list: { title: string; sub?: string; state: StepState }[] = [
    { title: 'Post and submit the link', sub: slot.dueAt ? `Due ${shortDate(slot.dueAt)} · ${relative(slot.dueAt)}` : 'Starts when the product arrives', state: st === 'missed' ? 'bad' : submitted ? 'done' : 'now' },
    {
      title: 'Automated checks',
      sub: slot.checks === 'failed' ? 'Something was flagged; the brand decides' : 'Post is public, on time, has #ad',
      state: !submitted || st === 'rejected' ? 'todo' : slot.checks === 'failed' ? 'bad' : slot.checks === 'passed' || paid ? 'done' : 'now',
    },
    {
      title: st === 'rejected' ? 'Brand asked for changes' : 'Brand review',
      sub: st === 'submitted' ? `Auto-paid ${relative(reviewEnds)} if they don’t reply` : st === 'rejected' ? 'Resubmit an updated post' : undefined,
      state: st === 'rejected' ? 'bad' : paid ? 'done' : st === 'submitted' ? 'now' : 'todo',
    },
    { title: `Paid ${100 - holdbackPct}%`, sub: paid ? usdc(BigInt(slot.amount) - BigInt(slot.holdback)) : undefined, state: paid ? 'done' : 'todo' },
  ];
  if (BigInt(slot.holdback) > 0n || (!paid && holdbackPct > 0 && slot.kind === 'post')) {
    list.push({
      title: st === 'holdback_forfeited' ? 'Post removed early' : `Live 7 days → last ${holdbackPct}%`,
      sub: st === 'holdback_released' ? usdc(slot.holdback) : st === 'holdback_forfeited' ? 'Holdback went back to the brand' : 'Keep the post up',
      state: st === 'holdback_released' ? 'done' : st === 'holdback_forfeited' ? 'bad' : st === 'released' ? 'now' : 'todo',
    });
  }
  return list;
}

const STEP_COLOR: Record<StepState, string> = { done: c.money, now: c.primary, todo: c.faint, bad: c.danger };
const STEP_ICON = { done: 'checkmark', now: 'circle.fill', todo: 'circle', bad: 'xmark' } as const;

export default function SlotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { slot, enrollment } = useSlot(id);

  if (!slot || !enrollment) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + 60, padding: 20 }}>
        <Text style={{ color: c.muted }}>Loading…</Text>
      </View>
    );
  }
  const camp = enrollment.campaign;
  const canSubmit = enrollment.status === 'active' && (slot.status === 'open' || slot.status === 'rejected');
  const reviewEnds = slot.submittedAt ? new Date(new Date(slot.submittedAt).getTime() + camp.reviewWindowSecs * 1000).toISOString() : null;
  const tone = slotStyle(slot.status);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 60, paddingBottom: 140, gap: 18 }} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={{ width: 64 }}>
            <CampaignCover camp={camp} height={64} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.brand}>{camp.brandName ?? camp.title}</Text>
            <Text style={styles.title}>{slotTitle(slot)}</Text>
          </View>
        </View>

        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.amount}>{usdc(slot.amount)}</Text>
            <SlotPill status={slot.status} />
          </View>
          <Text style={{ color: tone.color === c.danger ? c.danger : c.muted, fontSize: 14 }}>
            {slot.status === 'missed'
              ? 'Not delivered in time, so the money went back to the brand.'
              : slot.status === 'holdback_released'
                ? 'Paid in full. Nice work.'
                : 'Paid straight to your wallet. Kolab’s fee is on the brand.'}
          </Text>
        </Card>

        {canSubmit && editorAvailable && (
          <Card onPress={() => router.push({ pathname: '/editor/[id]', params: { id: slot.id } })} style={styles.editor}>
            <LinearGradient colors={gradients.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editorIcon}>
              <SymbolView name="scissors" tintColor="#fff" size={20} />
            </LinearGradient>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.stepTitle}>Edit your video</Text>
              <Text style={styles.stepSub}>Trim clips, AI hook, auto-captions, brand logo and music</Text>
            </View>
            <SymbolView name="chevron.right" tintColor={c.faint} size={14} />
          </Card>
        )}

        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {steps(slot, reviewEnds, camp.holdbackBps / 100).map((step, i, all) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.rail}>
                <View style={[styles.dot, { borderColor: STEP_COLOR[step.state], backgroundColor: step.state === 'todo' ? c.background : `${STEP_COLOR[step.state]}33` }]}>
                  <SymbolView name={STEP_ICON[step.state]} tintColor={STEP_COLOR[step.state]} size={step.state === 'now' ? 8 : 11} />
                </View>
                {i < all.length - 1 && <View style={[styles.line, step.state === 'done' && { backgroundColor: `${c.money}66` }]} />}
              </View>
              <View style={styles.stepBody}>
                <Text style={[styles.stepTitle, step.state === 'todo' && { color: c.muted }]}>{step.title}</Text>
                {step.sub && <Text style={styles.stepSub}>{step.sub}</Text>}
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      {canSubmit && (
        <Glass style={[styles.cta, { bottom: insets.bottom + 8, flexDirection: 'row', gap: 8 }]}>
          {slot.kind === 'post' && (
            <View style={{ flex: 1 }}>
              <Button label="Creator kit" variant="secondary" icon="wand.and.stars" onPress={() => router.push({ pathname: '/kit/[id]', params: { id: slot.id } })} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button
              label={slot.kind === 'ugc' ? 'Deliver video' : slot.status === 'rejected' ? 'Resubmit' : 'Submit post'}
              icon={slot.kind === 'ugc' ? 'film.stack' : 'paperplane.fill'}
              onPress={() => router.push({ pathname: '/submit/[id]', params: { id: slot.id } })}
            />
          </View>
        </Glass>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brand: { color: c.muted, fontFamily: font.medium, fontSize: 14 },
  title: { color: c.foreground, fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 },
  amount: { color: c.money, fontFamily: font.display, fontSize: 30, letterSpacing: -0.6 },
  step: { flexDirection: 'row', gap: 12, minHeight: 60 },
  rail: { width: 24, alignItems: 'center', paddingTop: 12 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, backgroundColor: c.border, marginVertical: 2 },
  stepBody: { flex: 1, paddingVertical: 12, gap: 2 },
  stepTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  stepSub: { color: c.muted, fontSize: 13 },
  cta: { position: 'absolute', left: 16, right: 16, padding: 8, borderRadius: 999 },
  editor: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editorIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
