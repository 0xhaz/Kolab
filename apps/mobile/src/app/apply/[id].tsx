import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Completeness, CreatorProfileCard } from '@/components/creator-profile';
import { Button, Card, failure, success } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCampaign } from '@/lib/queries';
import { useApply, useMyProfile } from '@/lib/profile';
import { useMe } from '@/lib/use-me';
import { firstName } from '@/lib/greeting';
import { errorMessage } from '@/lib/errors';
import { c, font, radius } from '@/lib/theme';

const MIN = 10;
const MAX = 500;

/** Bottom sheet: send the brand a pitch along with the creator profile. */
export default function ApplySheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: camp } = useCampaign(id);
  const { data: me } = useMe();
  const profile = useMyProfile();
  const apply = useApply(id);
  const toast = useToast();
  const [pitch, setPitch] = useState('');
  const length = pitch.trim().length;
  const name = me?.displayName ?? firstName(null, me?.email);
  const p = profile.data;

  async function send() {
    try {
      await apply.mutateAsync(pitch.trim());
      success();
      toast('Application sent. We’ll let you know when the brand decides.', 'success');
      router.back();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <ScrollView style={styles.sheet} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Text style={styles.kicker}>{camp?.brandName ?? 'Apply'}</Text>
      <Text style={styles.title}>Apply to {camp?.title ?? 'this campaign'}</Text>

      {!p ? (
        <Text style={styles.muted}>{profile.isError ? errorMessage(profile.error) : 'Loading your profile…'}</Text>
      ) : !p.complete ? (
        <Card style={{ gap: 12, backgroundColor: c.surfaceRaised }}>
          <View style={styles.row}>
            <SymbolView name="person.crop.circle.badge.exclamationmark" tintColor={c.warning} size={22} />
            <Text style={styles.heading}>Complete your profile first</Text>
          </View>
          <Text style={styles.muted}>This brand picks creators from their profiles. Add a niche, a channel and one sample of your work.</Text>
          <Completeness profile={p} />
          <Button
            label="Complete profile"
            icon="arrow.right"
            onPress={() => {
              router.back();
              router.push('/profile/edit');
            }}
          />
        </Card>
      ) : (
        <>
          <CreatorProfileCard profile={p} name={name} compact />
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Why you’re a fit for this brand</Text>
            <TextInput
              style={styles.input}
              placeholder="Your audience, a past post that worked, an idea for this campaign…"
              placeholderTextColor={c.faint}
              multiline
              maxLength={MAX}
              value={pitch}
              onChangeText={setPitch}
            />
            <Text style={[styles.counter, length > 0 && length < MIN && { color: c.warning }]}>
              {length < MIN ? `At least ${MIN} characters` : `${length}/${MAX}`}
            </Text>
          </View>
          <Button label="Send application" icon="paperplane.fill" busy={apply.isPending} disabled={length < MIN} onPress={send} />
          <Text style={styles.fine}>The brand sees your profile, samples and on-chain track record. Joining unlocks once they accept you.</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: c.surface },
  content: { padding: 24, paddingTop: 28, gap: 16, paddingBottom: 48 },
  kicker: { color: c.muted, fontFamily: font.medium, fontSize: 14 },
  title: { color: c.foreground, fontFamily: font.display, fontSize: 26, letterSpacing: -0.5, marginTop: -10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { color: c.foreground, fontFamily: font.semibold, fontSize: 17 },
  muted: { color: c.muted, fontSize: 14, lineHeight: 20 },
  label: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  input: { minHeight: 120, textAlignVertical: 'top', backgroundColor: c.surfaceRaised, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, color: c.foreground, fontSize: 16, lineHeight: 22, padding: 14 },
  counter: { color: c.faint, fontSize: 12, alignSelf: 'flex-end' },
  fine: { color: c.faint, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
