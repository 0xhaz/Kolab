import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import type { CaptionLanguage, PostRequirements, PrecheckItem } from '@kolab/shared';
import { Button, Card, Chip, SectionHeader, failure, success, tap } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useApi } from '@/lib/api';
import { useSlot } from '@/lib/queries';
import { errorMessage } from '@/lib/errors';
import { slotTitle } from '@/lib/earnings';
import { pickVideo } from '@/lib/ugc';
import { c, font, radius } from '@/lib/theme';

type Vibe = 'casual' | 'honest review' | 'tutorial' | 'hype';
const LANGS: { value: CaptionLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Bahasa MY' },
  { value: 'id', label: 'Bahasa ID' },
];
const VIBES: Vibe[] = ['casual', 'honest review', 'tutorial', 'hype'];

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => {
            tap();
            onChange(o.value);
          }}
        >
          <Chip label={o.label} color={o.value === value ? c.primary : c.muted} />
        </Pressable>
      ))}
    </View>
  );
}

/** Creator kit for one deliverable: write the caption, check it, then post it on TikTok. */
export default function CreatorKit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { slot, enrollment } = useSlot(id);
  const api = useApi();
  const toast = useToast();
  const [language, setLanguage] = useState<CaptionLanguage>('en');
  const [vibe, setVibe] = useState<Vibe>('casual');
  const [caption, setCaption] = useState('');
  const [hook, setHook] = useState<string | null>(null);
  const [source, setSource] = useState<'gemini' | 'template' | null>(null);
  const [checks, setChecks] = useState<PrecheckItem[]>([]);
  const [req, setReq] = useState<PostRequirements | null>(null);
  const [busy, setBusy] = useState<'caption' | 'share' | null>(null);

  // Re-check the caption as the creator edits it (debounced).
  useEffect(() => {
    if (!caption) return;
    const t = setTimeout(() => {
      api<{ checks: PrecheckItem[]; requirements: PostRequirements }>(`/slots/${id}/precheck`, { method: 'POST', body: JSON.stringify({ caption }) })
        .then((r) => {
          setChecks(r.checks);
          setReq(r.requirements);
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [caption, api, id]);

  async function generate() {
    setBusy('caption');
    try {
      const r = await api<{ caption: string; hook: string; source: 'gemini' | 'template'; checks: PrecheckItem[]; requirements: PostRequirements }>(
        `/slots/${id}/caption`,
        { method: 'POST', body: JSON.stringify({ language, vibe }) },
      );
      setCaption(r.caption);
      setHook(r.hook);
      setSource(r.source);
      setChecks(r.checks);
      setReq(r.requirements);
      success();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function postToTikTok() {
    setBusy('share');
    try {
      const video = await pickVideo();
      if (!video) return;
      await Clipboard.setStringAsync(caption);
      toast('Caption copied. Paste it in TikTok.', 'info');
      // System share sheet with the video: TikTok, Instagram, YouTube… (TikTok Share Kit once the client key is set)
      await Share.share({ url: video.uri, message: undefined });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  const allPassed = checks.length > 0 && checks.every((ck) => ck.passed);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 60, paddingBottom: 60, gap: 20 }}>
      <View>
        <Text style={styles.kicker}>{enrollment?.campaign.brandName ?? 'Creator kit'}</Text>
        <Text style={styles.title}>{slot ? slotTitle(slot) : 'Creator kit'}</Text>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeader title="1 · Caption" />
        <Card style={{ gap: 12 }}>
          <Choice value={language} options={LANGS} onChange={setLanguage} />
          <Choice value={vibe} options={VIBES.map((v) => ({ value: v, label: v }))} onChange={setVibe} />
          <Button label={caption ? 'Rewrite caption' : 'Write my caption'} icon="sparkles" busy={busy === 'caption'} onPress={generate} />
          {hook && (
            <View style={styles.hook}>
              <SymbolView name="mic.fill" tintColor={c.warning} size={14} />
              <Text style={styles.hookText}>Say in the first 3 s: “{hook}”</Text>
            </View>
          )}
          <TextInput
            style={styles.caption}
            multiline
            placeholder="Write or generate your caption…"
            placeholderTextColor={c.faint}
            value={caption}
            onChangeText={setCaption}
          />
          {source === 'template' && <Text style={styles.fine}>Written from a template. Make it yours before posting.</Text>}
          <Button
            label="Copy caption"
            variant="secondary"
            icon="doc.on.doc"
            disabled={!caption}
            onPress={async () => {
              await Clipboard.setStringAsync(caption);
              success();
              toast('Caption copied', 'info');
            }}
          />
        </Card>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeader title="2 · Pre-check" />
        <Card style={{ gap: 10 }}>
          {checks.length === 0 ? (
            <Text style={styles.fine}>
              {req ? '' : 'We check your caption against the brief, the same way the brand’s automated review will.'}
            </Text>
          ) : (
            checks.map((ck) => (
              <View key={ck.key} style={styles.check}>
                <SymbolView name={ck.passed ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'} tintColor={ck.passed ? c.money : c.warning} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>{ck.label}</Text>
                  {!ck.passed && ck.fix && <Text style={styles.fine}>{ck.fix}</Text>}
                </View>
              </View>
            ))
          )}
          {allPassed && <Text style={[styles.fine, { color: c.money }]}>Looks good. This passes the automated checks.</Text>}
        </Card>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeader title="3 · Post" />
        <Card style={{ gap: 12 }}>
          <Text style={styles.fine}>Pick your edited video. We copy the caption, then open the share sheet so you can post to TikTok, Instagram or YouTube.</Text>
          <Button label="Post to TikTok" icon="square.and.arrow.up" busy={busy === 'share'} disabled={!caption} onPress={postToTikTok} />
          <Text style={styles.fine}>Turn on TikTok’s “Paid partnership” toggle when posting. Then come back and submit the link.</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kicker: { color: c.muted, fontFamily: font.medium, fontSize: 14 },
  title: { color: c.foreground, fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 },
  hook: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${c.warning}14`, borderRadius: radius.md, padding: 10 },
  hookText: { flex: 1, color: c.foreground, fontSize: 14, fontFamily: font.medium },
  caption: { minHeight: 140, color: c.foreground, fontSize: 15, lineHeight: 22, backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: c.border, textAlignVertical: 'top' },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checkLabel: { color: c.foreground, fontSize: 15 },
  fine: { color: c.muted, fontSize: 13, lineHeight: 18 },
});
