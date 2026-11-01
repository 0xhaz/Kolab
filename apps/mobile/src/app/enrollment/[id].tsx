import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import type { ShippingAddress } from '@kolab/shared';
import { CampaignCover } from '@/components/campaign';
import { BrandKitSection } from '@/components/brand-kit-section';
import { Avatar, Button, Card, Chip, SectionHeader, SlotPill, SlotStrip, failure, success, tap } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useApi } from '@/lib/api';
import { keys, useEnrollment } from '@/lib/queries';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { errorMessage } from '@/lib/errors';
import { slotTitle } from '@/lib/earnings';
import { relative, shortDate, usdc } from '@/lib/format';
import { c, font, gradients, radius, ui } from '@/lib/theme';

function AddressForm({ enrollmentId, onSaved }: { enrollmentId: string; onSaved: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ShippingAddress>({ name: '', line1: '', line2: '', city: '', postcode: '', country: 'MY', phone: '' });
  const field = (key: keyof ShippingAddress, placeholder: string, props: object = {}) => (
    <TextInput style={ui.input} placeholder={placeholder} placeholderTextColor={c.faint} value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} {...props} />
  );

  async function save() {
    setBusy(true);
    try {
      await api(`/enrollments/${enrollmentId}/address`, { method: 'PUT', body: JSON.stringify(form) });
      success();
      toast('Address saved. Only this brand can see it.', 'success');
      onSaved();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <SymbolView name="lock.fill" tintColor={c.money} size={14} />
        <Text style={styles.small}>Encrypted · only this brand sees it · deleted 30 days after the campaign</Text>
      </View>
      {field('name', 'Full name', { autoComplete: 'name' })}
      {field('line1', 'Street address', { autoComplete: 'street-address' })}
      {field('line2', 'Apartment, unit (optional)')}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>{field('city', 'City')}</View>
        <View style={{ width: 120 }}>{field('postcode', 'Postcode', { keyboardType: 'number-pad' })}</View>
      </View>
      {field('phone', 'Phone', { keyboardType: 'phone-pad', autoComplete: 'tel' })}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['MY', 'ID', 'PH', 'TH'] as const).map((cc) => (
          <Pressable
            key={cc}
            onPress={() => {
              tap();
              setForm((f) => ({ ...f, country: cc }));
            }}
          >
            <Chip label={cc} color={form.country === cc ? c.primary : c.muted} />
          </Pressable>
        ))}
      </View>
      <Button label="Save address" busy={busy} onPress={save} disabled={!form.name || !form.line1 || !form.city || !form.postcode || !form.phone} />
    </Card>
  );
}

function ShipSteps({ status }: { status: string }) {
  const at = status === 'awaiting_shipment' ? 0 : status === 'in_transit' || status === 'not_received' ? 1 : 2;
  const labels = ['Joined', 'Shipped', 'Received'];
  return (
    <View style={styles.shipRow}>
      {labels.map((l, i) => (
        <View key={l} style={{ flex: 1, gap: 6 }}>
          <View style={[styles.shipBar, i <= at && { backgroundColor: i === at && at < 2 ? c.primary : c.money }]} />
          <Text style={[styles.small, i <= at && { color: c.foreground }]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

export default function EnrollmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const q = useEnrollment(id);
  const e = q.enrollment;
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(label: string, path: string, done: string) {
    setBusy(label);
    try {
      await send(path, {});
      await qc.invalidateQueries({ queryKey: keys.enrollments });
      success();
      toast(done, 'success');
    } catch (err) {
      failure();
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  if (!e) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + 60, padding: 20 }}>
        <Text style={{ color: c.muted }}>{q.isLoading ? 'Loading…' : 'Campaign not found.'}</Text>
      </View>
    );
  }
  const camp = e.campaign;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      <CampaignCover camp={camp} height={200 + insets.top} rounded={false}>
        <View style={styles.coverContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar name={camp.brandName ?? 'Brand'} size={28} />
            <Text style={styles.coverBrand}>{camp.brandName ?? 'Brand'}</Text>
          </View>
          <Pressable onPress={() => router.push({ pathname: '/campaign/[id]', params: { id: camp.id } })}>
            <Text style={styles.coverTitle} numberOfLines={2}>
              {camp.title}
            </Text>
            <Text style={styles.coverLink}>Brief & terms ›</Text>
          </Pressable>
        </View>
      </CampaignCover>

      <View style={styles.body}>
        <BrandKitSection camp={camp} enrollmentId={e.id} />

        {camp.requiresShipping && (
          <View style={{ gap: 12 }}>
            <SectionHeader title="Your product" />
            <Card style={{ gap: 14 }}>
              <ShipSteps status={e.status} />
              {e.trackingRef && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.small}>Tracking</Text>
                  <Text style={[styles.small, { color: c.foreground, fontFamily: 'Menlo' }]} selectable>
                    {e.trackingRef}
                  </Text>
                </View>
              )}
              {e.status === 'in_transit' && (
                <>
                  <Text style={styles.text}>Got it? Your deadlines start the day you confirm.</Text>
                  <Button label="I received it" icon="checkmark" busy={busy === 'received'} onPress={() => act('received', `/enrollments/${e.id}/tx/confirm-received`, 'Confirmed. Your deadlines start today.')} />
                  <Button
                    label="It hasn’t arrived"
                    variant="danger"
                    busy={busy === 'nr'}
                    onPress={() => act('nr', `/enrollments/${e.id}/tx/report-not-received`, 'Reported. The brand can reship or cancel; your record isn’t affected.')}
                  />
                </>
              )}
              {e.status === 'active' && e.receivedAt && <Text style={styles.small}>Received {shortDate(e.receivedAt)}. Deadlines count from that day.</Text>}
              {e.status === 'awaiting_shipment' && e.hasAddress && <Text style={styles.small}>Address saved. The brand will ship soon.</Text>}
            </Card>
            {e.status === 'awaiting_shipment' && !e.hasAddress && <AddressForm enrollmentId={e.id} onSaved={() => q.refetch()} />}
          </View>
        )}

        {camp.type === 'per_sale' && (
          <View style={{ gap: 12 }}>
            <SectionHeader title="Your voucher" />
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(e.voucherCode ?? '');
                success();
                toast('Voucher code copied', 'info');
              }}
            >
              <LinearGradient colors={gradients.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ticket}>
                <Text style={styles.ticketLabel}>Share this code · tap to copy</Text>
                <Text style={styles.ticketCode}>{e.voucherCode}</Text>
                <View style={styles.ticketCutLeft} />
                <View style={styles.ticketCutRight} />
                <Text style={styles.ticketLabel}>Each confirmed order earns you {usdc(camp.perSaleAmount)}</Text>
              </LinearGradient>
            </Pressable>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.claimValue}>{usdc(e.salesAccrued)}</Text>
                <Text style={styles.small}>ready to claim</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Claim" busy={busy === 'claim'} disabled={BigInt(e.salesAccrued) === 0n} onPress={() => act('claim', `/enrollments/${e.id}/tx/claim-sales`, 'Sales payout sent to your wallet')} />
              </View>
            </Card>
          </View>
        )}

        {e.slots.length > 0 && (
          <View style={{ gap: 12 }}>
            <SectionHeader title="Deliverables" />
            <SlotStrip statuses={e.slots.map((s) => s.status)} />
            {e.slots.map((s) => (
              <Card key={s.id} onPress={() => router.push({ pathname: '/slot/[id]', params: { id: s.id } })} style={styles.slotRow}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.slotTitle}>{slotTitle(s)}</Text>
                  <SlotPill status={s.status} />
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.slotAmount}>{usdc(s.amount, 0)}</Text>
                  <Text style={styles.small}>{s.dueAt ? `due ${relative(s.dueAt)}` : 'after delivery'}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.small}>Earned in this campaign</Text>
          <Text style={[styles.slotAmount, { fontSize: 16 }]}>{usdc(e.earnedTotal)}</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  coverContent: { position: 'absolute', left: 20, right: 20, bottom: 18, gap: 8 },
  coverBrand: { color: '#fff', fontFamily: font.semibold, fontSize: 14 },
  coverTitle: { color: '#fff', fontFamily: font.display, fontSize: 24, letterSpacing: -0.5 },
  coverLink: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  body: { padding: 20, gap: 22 },
  small: { color: c.muted, fontSize: 13 },
  text: { color: c.foreground, fontSize: 15 },
  shipRow: { flexDirection: 'row', gap: 8 },
  shipBar: { height: 6, borderRadius: 3, backgroundColor: c.surfaceRaised },
  ticket: { borderRadius: radius.lg, padding: 20, gap: 8, overflow: 'hidden' },
  ticketLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  ticketCode: { color: '#fff', fontFamily: font.display, fontSize: 34, letterSpacing: 3 },
  ticketCutLeft: { position: 'absolute', left: -12, top: '50%', width: 24, height: 24, borderRadius: 12, backgroundColor: c.background },
  ticketCutRight: { position: 'absolute', right: -12, top: '50%', width: 24, height: 24, borderRadius: 12, backgroundColor: c.background },
  claimValue: { color: c.money, fontFamily: font.display, fontSize: 22 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slotTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 16 },
  slotAmount: { color: c.money, fontFamily: font.display, fontSize: 18 },
});
