import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { CampaignDto } from '@kolab/shared';
import { usdc } from '@/lib/format';
import { absUrl } from '@/lib/brand-kit';
import { c, font, gradients, radius } from '@/lib/theme';
import { Avatar, Chip, PressableScale } from './ui';

export const TYPE_LABEL: Record<CampaignDto['type'], string> = {
  per_post: 'Per post',
  monthly: 'Monthly',
  per_sale: 'Per sale',
  ugc: 'UGC',
};

export function typeSymbol(camp: CampaignDto): SymbolViewProps['name'] {
  if (camp.type === 'per_sale') return 'tag.fill';
  if (camp.type === 'ugc') return 'video.fill';
  if (camp.requiresShipping) return 'shippingbox.fill';
  return 'sparkles';
}

function hash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** What the creator earns, in one line. */
export function payout(camp: CampaignDto): { amount: string; detail: string } {
  if (camp.type === 'per_sale') return { amount: usdc(camp.perSaleAmount, 0), detail: 'per confirmed sale' };
  const total = camp.slots.reduce((sum, sl) => sum + BigInt(sl.amount), 0n);
  const weeks = Math.max(1, Math.round(Math.max(...camp.slots.map((sl) => sl.dueOffsetSecs)) / 604_800));
  const kind = camp.slots.every((sl) => sl.kind === 'ugc') ? 'video' : 'post';
  return {
    amount: usdc(total, 0),
    detail: `${camp.slots.length} ${kind}${camp.slots.length === 1 ? '' : 's'} · ${weeks} week${weeks === 1 ? '' : 's'}`,
  };
}

/** Brand photo if provided, otherwise a generated gradient cover (no stock photos of real brands). */
export function CampaignCover({ camp, height, children, rounded = true }: { camp: CampaignDto; height: number; children?: ReactNode; rounded?: boolean }) {
  const [from, to] = gradients.covers[hash(camp.id) % gradients.covers.length]!;
  return (
    <View style={[{ height, overflow: 'hidden' }, rounded && { borderRadius: radius.lg }]}>
      {camp.coverUrl ? (
        <Image source={{ uri: absUrl(camp.coverUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
          <View style={[styles.blob, { top: -height * 0.3, right: -height * 0.2, width: height * 1.1, height: height * 1.1 }]} />
          <View style={[styles.blob, { bottom: -height * 0.5, left: -height * 0.3, width: height, height: height, opacity: 0.12 }]} />
          <View style={styles.symbol}>
            <SymbolView name={typeSymbol(camp)} tintColor="rgba(255,255,255,0.9)" size={height * 0.34} />
          </View>
        </LinearGradient>
      )}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** Status shown to every creator: the seller prepared assets (they unlock after joining). */
export function KitBadge({ camp, light }: { camp: CampaignDto; light?: boolean }) {
  if (!camp.hasBrandKit) return null;
  return <Chip label="Brand kit ready" color={light ? '#FFFFFF' : c.money} icon="checkmark.seal.fill" />;
}

/** Selective campaigns: the brand picks from applicants. Open campaigns show nothing. */
export function ApplyBadge({ camp }: { camp: CampaignDto }) {
  if (!camp.selective) return null;
  return <Chip label="Apply" color="#FFFFFF" icon="person.crop.circle.badge.checkmark" />;
}

/** Discover feed: big image-led card like a social post. */
export function CampaignFeedCard({ camp, onPress }: { camp: CampaignDto; onPress: () => void }) {
  const p = payout(camp);
  return (
    <PressableScale onPress={onPress} style={styles.feedCard}>
      <CampaignCover camp={camp} height={210}>
        <View style={styles.coverTop}>
          <Chip label={TYPE_LABEL[camp.type]} color="#FFFFFF" />
          {camp.requiresShipping && <Chip label="Free product" color="#FFFFFF" icon="gift.fill" />}
          <KitBadge camp={camp} light />
          <ApplyBadge camp={camp} />
        </View>
        <View style={styles.coverBottom}>
          <View style={styles.brandRow}>
            <Avatar name={camp.brandName ?? 'Brand'} size={28} />
            <Text style={styles.brandName}>{camp.brandName ?? 'Brand'}</Text>
            <SymbolView name="checkmark.seal.fill" tintColor="#7DD3FC" size={14} />
          </View>
          <Text style={styles.coverTitle} numberOfLines={2}>
            {camp.title}
          </Text>
        </View>
      </CampaignCover>
      <View style={styles.feedFooter}>
        <View>
          <Text style={styles.earn}>Earn {p.amount}</Text>
          <Text style={styles.earnDetail}>{p.detail}</Text>
        </View>
        <View style={styles.lock}>
          <SymbolView name="lock.fill" tintColor={c.money} size={12} />
          <Text style={styles.lockText}>Paid via escrow</Text>
        </View>
      </View>
    </PressableScale>
  );
}

/** Home rail: compact square card. */
export function CampaignRailCard({ camp, onPress }: { camp: CampaignDto; onPress: () => void }) {
  const p = payout(camp);
  return (
    <PressableScale onPress={onPress} style={{ width: 168 }}>
      <CampaignCover camp={camp} height={168}>
        {camp.selective && (
          <View style={styles.railTop}>
            <ApplyBadge camp={camp} />
          </View>
        )}
        <View style={styles.railBottom}>
          <Text style={styles.railEarn}>{p.amount}</Text>
          <Text style={styles.railTitle} numberOfLines={2}>
            {camp.brandName ?? camp.title}
          </Text>
        </View>
      </CampaignCover>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  symbol: { position: 'absolute', right: 18, top: 18, opacity: 0.9 },
  feedCard: { backgroundColor: c.surface, borderRadius: radius.lg + 4, borderWidth: 1, borderColor: c.border, padding: 6 },
  coverTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  coverBottom: { position: 'absolute', left: 14, right: 14, bottom: 14, gap: 6 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { color: '#fff', fontFamily: font.semibold, fontSize: 14 },
  coverTitle: { color: '#fff', fontFamily: font.display, fontSize: 21, letterSpacing: -0.3 },
  feedFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  earn: { color: c.money, fontFamily: font.display, fontSize: 20 },
  earnDetail: { color: c.muted, fontSize: 13, marginTop: 2 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lockText: { color: c.muted, fontSize: 12 },
  railTop: { position: 'absolute', top: 10, left: 10 },
  railBottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 2 },
  railEarn: { color: '#fff', fontFamily: font.display, fontSize: 20 },
  railTitle: { color: 'rgba(255,255,255,0.85)', fontFamily: font.medium, fontSize: 13 },
});
