import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { NICHES, PLATFORMS, PLATFORM_LABEL, type CreatorProfileDto, type Platform } from '@kolab/shared';
import { PLATFORM_SYMBOL, SampleTile } from '@/components/creator-profile';
import { Button, Card, Chip, Glass, PressableScale, SectionHeader, failure, success } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useAddSample, useMyProfile, usePickAndUploadSample, useRemoveSample, useUpdateProfile } from '@/lib/profile';
import { errorMessage } from '@/lib/errors';
import { c, font, radius } from '@/lib/theme';

const COUNTRIES = [
  { code: 'MY', label: 'Malaysia' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'PH', label: 'Philippines' },
  { code: 'TH', label: 'Thailand' },
] as const;
type Country = (typeof COUNTRIES)[number]['code'];
type Niche = (typeof NICHES)[number];

const MAX_NICHES = 5;
const MAX_CHANNELS = 5;
const MAX_SAMPLES = 6;

interface ChannelDraft {
  key: string;
  platform: Platform;
  handle: string;
  followers: string;
}

const newKey = () => Math.random().toString(36).slice(2);
const cleanHandle = (h: string) => h.trim().replace(/^@/, '');
const channelValid = (ch: ChannelDraft) => cleanHandle(ch.handle).length >= 2 && /^\d+$/.test(ch.followers.replace(/[,\s]/g, ''));

function ToggleChip({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} style={disabled && { opacity: 0.4 }}>
      <Chip label={label} color={on ? c.primary : c.muted} icon={on ? 'checkmark' : undefined} />
    </PressableScale>
  );
}

/** Profile form: bio, country, niches, channels (saved together) and work samples (saved one by one). */
export default function EditProfileScreen() {
  const q = useMyProfile();
  const insets = useSafeAreaInsets();
  if (!q.data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, padding: 20, paddingTop: insets.top + 60 }}>
        <Text style={{ color: c.muted }}>{q.isError ? errorMessage(q.error) : 'Loading…'}</Text>
      </View>
    );
  }
  return <EditForm profile={q.data} />;
}

function EditForm({ profile }: { profile: CreatorProfileDto }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const update = useUpdateProfile();
  const addSample = useAddSample();
  const removeSample = useRemoveSample();
  const pickAndUpload = usePickAndUploadSample();

  const [bio, setBio] = useState(profile.bio);
  const [country, setCountry] = useState<Country | undefined>(COUNTRIES.find((x) => x.code === profile.country)?.code);
  const [niches, setNiches] = useState<Niche[]>(profile.niches.filter((n): n is Niche => (NICHES as readonly string[]).includes(n)));
  const [channels, setChannels] = useState<ChannelDraft[]>(() =>
    profile.channels.map((ch) => ({ key: newKey(), platform: ch.platform, handle: ch.handle, followers: String(ch.followers) })),
  );
  const [link, setLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const samples = profile.samples;
  const allValid = channels.every(channelValid);
  const linkValid = /^https:\/\/\S+\.\S+/.test(link.trim());
  const full = samples.length >= MAX_SAMPLES;

  function toggleNiche(n: Niche) {
    setNiches((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : cur.length < MAX_NICHES ? [...cur, n] : cur));
  }

  function patchChannel(key: string, patch: Partial<ChannelDraft>) {
    setChannels((cur) => cur.map((ch) => (ch.key === key ? { ...ch, ...patch } : ch)));
  }

  async function save() {
    try {
      await update.mutateAsync({
        bio: bio.trim(),
        country,
        niches,
        channels: channels.map((ch) => ({ platform: ch.platform, handle: cleanHandle(ch.handle), followers: Number(ch.followers.replace(/[,\s]/g, '')) })),
      });
      success();
      toast('Profile saved', 'success');
      router.back();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    }
  }

  async function addMedia() {
    setUploading(true);
    try {
      const uploadId = await pickAndUpload();
      if (!uploadId) return;
      await addSample.mutateAsync({ uploadId });
      success();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function addLink() {
    try {
      await addSample.mutateAsync({ url: link.trim() });
      setLink('');
      success();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    try {
      await removeSample.mutateAsync(id);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 60, paddingBottom: 140, gap: 22 }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ gap: 4 }}>
          <Text style={styles.title}>Your creator profile</Text>
          <Text style={styles.muted}>Brands see this when you apply to a selective campaign.</Text>
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Bio" />
          <TextInput
            style={[styles.input, styles.bio]}
            placeholder="What you make and who watches it"
            placeholderTextColor={c.faint}
            multiline
            maxLength={280}
            value={bio}
            onChangeText={setBio}
          />
          <Text style={styles.counter}>{bio.length}/280</Text>
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Country" />
          <View style={styles.wrap}>
            {COUNTRIES.map((ct) => (
              <ToggleChip key={ct.code} label={ct.label} on={country === ct.code} onPress={() => setCountry(country === ct.code ? undefined : ct.code)} />
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Niches" action={`${niches.length}/${MAX_NICHES}`} />
          <View style={styles.wrap}>
            {NICHES.map((n) => {
              const on = niches.includes(n);
              return <ToggleChip key={n} label={n} on={on} disabled={!on && niches.length >= MAX_NICHES} onPress={() => toggleNiche(n)} />;
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Channels" />
          {channels.map((ch) => (
            <Card key={ch.key} style={{ gap: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
                {PLATFORMS.map((pl) => (
                  <ToggleChip key={pl} label={PLATFORM_LABEL[pl]} on={ch.platform === pl} onPress={() => patchChannel(ch.key, { platform: pl })} />
                ))}
              </ScrollView>
              <View style={styles.channelRow}>
                <View style={[styles.field, { flex: 1.4 }]}>
                  <SymbolView name={PLATFORM_SYMBOL[ch.platform]} tintColor={c.muted} size={15} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="@handle"
                    placeholderTextColor={c.faint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={41}
                    value={ch.handle}
                    onChangeText={(t) => patchChannel(ch.key, { handle: t })}
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Followers"
                    placeholderTextColor={c.faint}
                    keyboardType="number-pad"
                    value={ch.followers}
                    onChangeText={(t) => patchChannel(ch.key, { followers: t.replace(/[^\d]/g, '') })}
                  />
                </View>
                <Pressable hitSlop={10} onPress={() => setChannels((cur) => cur.filter((x) => x.key !== ch.key))}>
                  <SymbolView name="minus.circle.fill" tintColor={c.danger} size={22} />
                </Pressable>
              </View>
            </Card>
          ))}
          {channels.length < MAX_CHANNELS && (
            <Button
              label="Add channel"
              variant="secondary"
              icon="plus"
              onPress={() => setChannels((cur) => [...cur, { key: newKey(), platform: 'tiktok', handle: '', followers: '' }])}
            />
          )}
          <Text style={styles.fine}>Self-declared. Brands see these numbers as you enter them until we can verify them with the platform.</Text>
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Work samples" action={`${samples.length}/${MAX_SAMPLES}`} />
          {samples.length > 0 && (
            <View style={styles.grid}>
              {samples.map((sm) => (
                <View key={sm.id} style={styles.gridItem}>
                  <SampleTile sample={sm} size={104} />
                  <Pressable hitSlop={8} style={styles.removeBtn} onPress={() => remove(sm.id)} disabled={removing === sm.id}>
                    {removing === sm.id ? <ActivityIndicator size="small" color="#fff" /> : <SymbolView name="xmark" tintColor="#fff" size={11} />}
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {full ? (
            <Text style={styles.muted}>That’s the maximum. Remove one to add another.</Text>
          ) : (
            <>
              <Button label={uploading ? 'Uploading…' : 'Add photo or video'} variant="secondary" icon="photo.on.rectangle" busy={uploading} onPress={addMedia} />
              <View style={styles.channelRow}>
                <View style={[styles.field, { flex: 1 }]}>
                  <SymbolView name="link" tintColor={c.muted} size={15} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Add a post link (https://…)"
                    placeholderTextColor={c.faint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    value={link}
                    onChangeText={setLink}
                    onSubmitEditing={() => linkValid && addLink()}
                  />
                </View>
                <PressableScale onPress={addLink} disabled={!linkValid || addSample.isPending} style={[styles.addLink, (!linkValid || addSample.isPending) && { opacity: 0.4 }]}>
                  <SymbolView name="plus" tintColor="#fff" size={16} />
                </PressableScale>
              </View>
            </>
          )}
          <Text style={styles.fine}>Samples save right away. Brands see up to 6.</Text>
        </View>
      </ScrollView>

      <Glass style={[styles.cta, { bottom: insets.bottom + 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaTitle}>{allValid ? 'Ready to save' : 'Check your channels'}</Text>
          <Text style={styles.ctaSub}>{allValid ? `${niches.length} niches · ${channels.length} channels` : 'Each needs a handle and follower count'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Save" icon="checkmark" busy={update.isPending} disabled={!allValid} onPress={save} />
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: c.foreground, fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 },
  muted: { color: c.muted, fontSize: 14, lineHeight: 20 },
  fine: { color: c.faint, fontSize: 12, lineHeight: 17 },
  counter: { color: c.faint, fontSize: 12, alignSelf: 'flex-end', marginTop: -4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: c.surfaceRaised, borderColor: c.borderStrong, borderWidth: 1, borderRadius: radius.md, color: c.foreground, fontSize: 16, paddingHorizontal: 14, paddingVertical: 14 },
  bio: { minHeight: 96, textAlignVertical: 'top', paddingTop: 14 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceRaised, borderRadius: radius.md, paddingHorizontal: 12, borderWidth: 1, borderColor: c.borderStrong },
  fieldInput: { flex: 1, color: c.foreground, fontSize: 15, paddingVertical: 12 },
  addLink: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { position: 'relative' },
  removeBtn: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, paddingLeft: 18, borderRadius: 999 },
  ctaTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  ctaSub: { color: c.muted, fontSize: 12 },
});
