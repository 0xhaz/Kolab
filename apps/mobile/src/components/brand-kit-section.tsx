import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import type { CampaignDto } from '@kolab/shared';
import { Button, Card, Chip, PressableScale, SectionHeader, failure, success } from './ui';
import { useToast } from './toast';
import { absUrl, saveRemoteToPhotos, useBrandKit } from '@/lib/brand-kit';
import { errorMessage } from '@/lib/errors';
import { c, font, radius } from '@/lib/theme';

/** Locked preview for creators who haven't joined: tells them the seller came prepared. */
export function BrandKitLocked({ camp }: { camp: CampaignDto }) {
  if (!camp.hasBrandKit) return null;
  return (
    <Card style={styles.locked}>
      <View style={styles.lockIcon}>
        <SymbolView name="lock.fill" tintColor={c.money} size={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>Brand kit ready</Text>
        <Text style={styles.sub}>
          {camp.brandName ?? 'The brand'} prepared {camp.kitAssetCount} assets (logo, product photos, colours) and templates. Join to unlock.
        </Text>
      </View>
    </Card>
  );
}

/** Gallery + actions for joined creators. */
export function BrandKitSection({ camp, enrollmentId }: { camp: CampaignDto; enrollmentId: string }) {
  const kit = useBrandKit(camp.id, camp.hasBrandKit);
  const toast = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  if (!camp.hasBrandKit) return null;
  const data = kit.data;
  const assets = data ? [...(data.logo ? [data.logo] : []), ...data.products] : [];

  async function save(id: string, url: string) {
    setSaving(id);
    try {
      await saveRemoteToPhotos(url);
      success();
      toast('Saved to Photos', 'success');
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(null);
    }
  }

  async function saveAll() {
    setSaving('all');
    try {
      for (const a of assets) await saveRemoteToPhotos(a.url);
      success();
      toast(`Video pack saved: ${assets.length} files in Photos`, 'success');
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Brand kit" />
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Chip label="Ready" color={c.money} icon="checkmark.seal.fill" />
          {data?.colors.map((col) => (
            <View key={col} style={[styles.swatch, { backgroundColor: col }]} />
          ))}
        </View>
        {kit.isLoading && <Text style={styles.sub}>Loading assets…</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {assets.map((a) => (
            <PressableScale key={a.id} onPress={() => save(a.id, a.url)}>
              <View style={[styles.thumb, a.kind === 'logo' && { backgroundColor: '#fff' }]}>
                <Image source={{ uri: absUrl(a.url) }} style={StyleSheet.absoluteFill} contentFit={a.kind === 'logo' ? 'contain' : 'cover'} />
                <View style={styles.thumbAction}>
                  <SymbolView name={saving === a.id ? 'hourglass' : 'arrow.down.to.line'} tintColor="#fff" size={12} />
                </View>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
        {data?.notes && (
          <View style={styles.note}>
            <SymbolView name="info.circle" tintColor={c.muted} size={14} />
            <Text style={[styles.sub, { flex: 1 }]}>{data.notes}</Text>
          </View>
        )}
        <Button label="Create content" icon="paintbrush.pointed.fill" onPress={() => router.push({ pathname: '/studio/[id]', params: { id: enrollmentId } })} />
        <Button label={saving === 'all' ? 'Saving…' : 'Save video pack to Photos'} variant="secondary" icon="square.and.arrow.down.on.square" busy={saving === 'all'} onPress={saveAll} />
        <Text style={styles.fine}>For videos, add the logo and photos in TikTok’s editor or CapCut. Tap any asset to save just that one.</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  locked: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: `${c.money}44`, backgroundColor: `${c.money}0F` },
  lockIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${c.money}22`, alignItems: 'center', justifyContent: 'center' },
  title: { color: c.foreground, fontFamily: font.semibold, fontSize: 16 },
  sub: { color: c.muted, fontSize: 13, lineHeight: 18 },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: c.borderStrong },
  thumb: { width: 96, height: 120, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border },
  thumbAction: { position: 'absolute', right: 6, bottom: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  fine: { color: c.faint, fontSize: 12, lineHeight: 16 },
});
