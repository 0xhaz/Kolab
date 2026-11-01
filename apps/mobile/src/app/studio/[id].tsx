import { useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { captureRef } from 'react-native-view-shot';
import { postRequirements } from '@kolab/shared';
import { Button, Chip, SectionHeader, failure, success, tap } from '@/components/ui';
import { useToast } from '@/components/toast';
import { RENDER, TEMPLATES, type TemplateId } from '@/components/templates';
import { absUrl, saveLocalToPhotos, useBrandKit } from '@/lib/brand-kit';
import { useEnrollment } from '@/lib/queries';
import { useMe } from '@/lib/use-me';
import { errorMessage } from '@/lib/errors';
import { c, font, radius, ui } from '@/lib/theme';

const DEFAULT_HEADLINE: Record<TemplateId, string> = {
  story: 'My new morning glow ✨',
  square: 'Two weeks in. Still obsessed.',
  review: 'Brighter skin in two weeks, and no sticky feel.',
  voucher: 'Try it with my code',
};

/** Content studio: brand-kit templates the creator personalises and exports. */
export default function Studio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  const { enrollment: e } = useEnrollment(id);
  const { data: me } = useMe();
  const kit = useBrandKit(e?.campaign.id, !!e?.campaign.hasBrandKit);
  const toast = useToast();
  const canvas = useRef<View>(null);

  const perSale = e?.campaign.type === 'per_sale';
  const templates = TEMPLATES.filter((t) => !t.perSaleOnly || perSale);
  const [template, setTemplate] = useState<TemplateId>(perSale ? 'voucher' : 'story');
  const [photo, setPhoto] = useState<string | null>(null);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  if (!e) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + 60, padding: 20 }}>
        <Text style={{ color: c.muted }}>Loading…</Text>
      </View>
    );
  }

  const products = kit.data?.products ?? [];
  const chosenPhoto = photo ?? myPhoto ?? (products[0] ? absUrl(products[0].url) : null);
  const req = postRequirements(e.campaign, e.voucherCode);
  const width = screen - 40;
  const Render = RENDER[template];
  const props = {
    width,
    logoUri: kit.data?.logo ? absUrl(kit.data.logo.url) : null,
    photoUri: chosenPhoto,
    colors: [kit.data?.colors[0] ?? '#7C3AED', kit.data?.colors[1] ?? '#DB2777'] as [string, string],
    brandName: e.campaign.brandName ?? 'Brand',
    brandTag: req.brandTag,
    headline: headline ?? DEFAULT_HEADLINE[template],
    rating,
    handle: me?.email?.split('@')[0] ?? 'creator',
    voucher: e.voucherCode,
  };

  async function capture() {
    return captureRef(canvas, { format: 'png', quality: 1, result: 'tmpfile', width: 1080 });
  }

  async function save() {
    setBusy('save');
    try {
      await saveLocalToPhotos(await capture());
      success();
      toast('Saved to Photos. Post it from TikTok or Instagram.', 'success');
    } catch (err) {
      failure();
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy('share');
    try {
      await Share.share({ url: await capture() });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function pickMine() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!res.canceled && res.assets[0]) {
      setMyPhoto(res.assets[0].uri);
      setPhoto(res.assets[0].uri);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 56, paddingBottom: 60, gap: 18 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {templates.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              tap();
              setTemplate(t.id);
              setHeadline(null);
            }}
          >
            <Chip label={t.label} color={t.id === template ? c.primary : c.muted} />
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.canvasWrap}>
        <View ref={canvas} collapsable={false}>
          <Render {...props} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Photo" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {products.map((p) => {
            const uri = absUrl(p.url);
            return (
              <Pressable key={p.id} onPress={() => setPhoto(uri)}>
                <Image source={{ uri }} style={[styles.thumb, chosenPhoto === uri && styles.thumbOn]} contentFit="cover" />
              </Pressable>
            );
          })}
          {myPhoto && (
            <Pressable onPress={() => setPhoto(myPhoto)}>
              <Image source={{ uri: myPhoto }} style={[styles.thumb, chosenPhoto === myPhoto && styles.thumbOn]} contentFit="cover" />
            </Pressable>
          )}
          <Pressable onPress={pickMine} style={[styles.thumb, styles.addMine]}>
            <SymbolView name="person.crop.circle.badge.plus" tintColor={c.muted} size={22} />
            <Text style={styles.addText}>My photo</Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title={template === 'review' ? 'Your review' : 'Headline'} />
        <TextInput
          style={[ui.input, { minHeight: 56 }]}
          multiline
          maxLength={90}
          value={headline ?? DEFAULT_HEADLINE[template]}
          onChangeText={setHeadline}
          placeholderTextColor={c.faint}
        />
        {template === 'review' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  tap();
                  setRating(n);
                }}
                hitSlop={6}
              >
                <SymbolView name={n <= rating ? 'star.fill' : 'star'} tintColor="#F59E0B" size={26} />
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.fine}>The “#ad · Paid partnership” sticker is required and can’t be removed.</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Save to Photos" icon="square.and.arrow.down" busy={busy === 'save'} onPress={save} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Share" variant="secondary" icon="square.and.arrow.up" busy={busy === 'share'} onPress={share} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  canvasWrap: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: c.border, alignSelf: 'center' },
  thumb: { width: 72, height: 90, borderRadius: radius.sm, backgroundColor: c.surfaceRaised, borderWidth: 2, borderColor: 'transparent' },
  thumbOn: { borderColor: c.primary },
  addMine: { alignItems: 'center', justifyContent: 'center', gap: 4, borderColor: c.border, borderStyle: 'dashed', borderWidth: 1 },
  addText: { color: c.muted, fontSize: 11, fontFamily: font.medium },
  fine: { color: c.faint, fontSize: 12 },
});
