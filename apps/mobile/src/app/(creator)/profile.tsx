import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { router } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import type { SubmittedTx } from '@kolab/shared';
import { Avatar, Button, Card, Screen, SectionHeader, Stat, tap } from '@/components/ui';
import { useToast } from '@/components/toast';
import { CreatorProfileCard } from '@/components/creator-profile';
import { useMe } from '@/lib/use-me';
import { useMyEnrollments } from '@/lib/queries';
import { useMyProfile } from '@/lib/profile';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { errorMessage } from '@/lib/errors';
import { reliability, summarize } from '@/lib/earnings';
import { firstName } from '@/lib/greeting';
import { shortAddr, usdc } from '@/lib/format';
import { c, font, radius } from '@/lib/theme';

interface Badge {
  icon: SymbolViewProps['name'];
  label: string;
  earned: boolean;
  color: string;
}

export default function Profile() {
  const { logout } = usePrivy();
  const { data: me } = useMe();
  const toast = useToast();
  const q = useMyEnrollments();
  const profile = useMyProfile();
  const enrollments = q.data ?? [];
  const r = reliability(enrollments);
  const totals = summarize(enrollments);
  const send = useSponsoredTx();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmittedTx | null>(null);
  const name = me?.displayName ?? firstName(null, me?.email);
  const handle = me?.email?.split('@')[0] ?? 'creator';

  const badges: Badge[] = [
    { icon: 'sparkles', label: 'First campaign', earned: enrollments.length > 0, color: '#A78BFA' },
    { icon: 'checkmark.seal.fill', label: 'First delivery', earned: r.delivered > 0, color: c.money },
    { icon: 'flame.fill', label: '3 on time', earned: r.delivered >= 3 && r.missed === 0, color: '#FB923C' },
    { icon: 'clock.badge.checkmark.fill', label: 'Stayed live', earned: r.stayedLive > 0, color: '#38BDF8' },
    { icon: 'shippingbox.fill', label: 'Product received', earned: enrollments.some((e) => !!e.receivedAt && e.campaign.requiresShipping), color: '#F472B6' },
    { icon: 'tag.fill', label: 'First sale', earned: enrollments.some((e) => e.campaign.type === 'per_sale' && (BigInt(e.salesAccrued) > 0n || BigInt(e.earnedTotal) > 0n)), color: c.warning },
  ];

  async function testTx() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await send('/tx/memo', { memo: 'Kolab sponsored tx test' }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      refreshing={q.isRefetching || profile.isRefetching}
      onRefresh={() => {
        void q.refetch();
        void profile.refetch();
      }}
    >
      <View style={styles.header}>
        <Avatar name={name} size={92} ring />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.handle}>@{handle}</Text>
        <Pressable
          style={styles.wallet}
          onPress={async () => {
            tap();
            await Clipboard.setStringAsync(me?.walletPubkey ?? '');
            toast('Wallet address copied', 'info');
          }}
        >
          <SymbolView name="wallet.bifold.fill" tintColor={c.muted} size={13} />
          <Text style={styles.walletText}>{shortAddr(me?.walletPubkey ?? null)}</Text>
          <SymbolView name="doc.on.doc" tintColor={c.faint} size={12} />
        </Pressable>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeader title="Creator profile" />
        {profile.data ? (
          <CreatorProfileCard profile={profile.data} name={name} onEdit={() => router.push('/profile/edit')} />
        ) : (
          <Card>
            <Text style={{ color: c.muted, fontSize: 14 }}>{profile.isError ? errorMessage(profile.error) : 'Loading your profile…'}</Text>
          </Card>
        )}
      </View>

      <Card style={{ flexDirection: 'row', gap: 8, paddingVertical: 18 }}>
        <Stat label="on time" value={r.decided ? `${Math.round((r.delivered / r.decided) * 100)}%` : 'New'} />
        <View style={styles.divider} />
        <Stat label="delivered" value={String(r.delivered)} />
        <View style={styles.divider} />
        <Stat label="earned" value={usdc(totals.paid, 0).replace(' USDC', '')} tone="money" />
      </Card>
      <Text style={styles.fine}>Track record comes from on-chain outcomes, so ratings can’t override it.</Text>

      <View style={{ gap: 12 }}>
        <SectionHeader title="Badges" />
        <View style={styles.badges}>
          {badges.map((b) => (
            <View key={b.label} style={[styles.badge, !b.earned && { opacity: 0.4 }]}>
              <View style={[styles.badgeIcon, { backgroundColor: b.earned ? `${b.color}26` : c.surfaceRaised }]}>
                <SymbolView name={b.earned ? b.icon : 'lock.fill'} tintColor={b.earned ? b.color : c.faint} size={22} />
              </View>
              <Text style={styles.badgeLabel} numberOfLines={2}>
                {b.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeader title="Developer" />
        <Card style={{ gap: 12 }}>
          <Text style={{ color: c.muted, fontSize: 14 }}>Sign a memo with your wallet. Kolab pays the network fee.</Text>
          <Button label="Send test transaction" variant="secondary" icon="bolt.fill" busy={busy} onPress={testTx} />
          {result && (
            <Pressable onPress={() => Linking.openURL(result.explorerUrl)}>
              <Text style={{ color: c.primary, fontSize: 13 }}>Confirmed {result.signature.slice(0, 16)}… · open in Explorer</Text>
            </Pressable>
          )}
        </Card>
      </View>

      <Button label="Sign out" variant="secondary" onPress={() => logout()} />
      <Button label="Delete account" variant="danger" icon="trash" onPress={() => router.push('/delete-account')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 6, paddingTop: 8 },
  name: { color: c.foreground, fontFamily: font.display, fontSize: 26, letterSpacing: -0.5, marginTop: 6 },
  handle: { color: c.muted, fontSize: 15 },
  wallet: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginTop: 6 },
  walletText: { color: c.foreground, fontFamily: 'Menlo', fontSize: 12 },
  divider: { width: 1, backgroundColor: c.border },
  fine: { color: c.faint, fontSize: 12, textAlign: 'center', marginTop: -8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: { width: '31%', backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: 12, alignItems: 'center', gap: 8 },
  badgeIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  badgeLabel: { color: c.foreground, fontSize: 12, fontFamily: font.medium, textAlign: 'center' },
});
