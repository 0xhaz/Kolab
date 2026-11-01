import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { Button, failure, success } from '@/components/ui';
import { useToast } from '@/components/toast';
import { keys, useSlot } from '@/lib/queries';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { errorMessage } from '@/lib/errors';
import { slotTitle } from '@/lib/earnings';
import { File } from 'expo-file-system';
import { pickVideo, useUploadUgc, type PickedVideo } from '@/lib/ugc';
import { c, font, radius } from '@/lib/theme';

const POST_CHECKS = ['Post is public', 'Caption has #ad', 'Product shown in the first 3 seconds'];
const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

/** Bottom sheet: submit a post link, or deliver a UGC video file (its SHA-256 goes on-chain). */
export default function SubmitSheet() {
  const { id, file } = useLocalSearchParams<{ id: string; file?: string }>();
  const { slot, enrollment } = useSlot(id);
  const send = useSponsoredTx();
  const upload = useUploadUgc();
  const qc = useQueryClient();
  const toast = useToast();
  const [url, setUrl] = useState('');
  // A video exported from the editor arrives pre-selected.
  const [video, setVideo] = useState<PickedVideo | null>(() =>
    file ? { uri: file, name: 'kolab-edit.mp4', mime: 'video/mp4', size: new File(file).size ?? 0, duration: null } : null,
  );
  const [stage, setStage] = useState<string | null>(null);
  const isUgc = slot?.kind === 'ugc';
  const valid = isUgc ? !!video : /^https?:\/\/\S+\.\S+/.test(url.trim());

  async function submit() {
    try {
      let body: { url: string } | { uploadId: string };
      if (isUgc && video) {
        setStage('Fingerprinting & uploading…');
        const up = await upload(video);
        body = { uploadId: up.uploadId };
      } else {
        body = { url: url.trim() };
      }
      setStage('Recording on Solana…');
      await send(`/slots/${id}/tx/submit`, body);
      await qc.invalidateQueries({ queryKey: keys.enrollments });
      success();
      toast(isUgc ? 'Delivered! The file’s fingerprint is on-chain.' : 'Submitted! Checks are running now.', 'success');
      router.back();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setStage(null);
    }
  }

  return (
    <View style={styles.sheet}>
      <Text style={styles.kicker}>{enrollment?.campaign.brandName ?? 'Submit'}</Text>
      <Text style={styles.title}>{slot ? slotTitle(slot) : 'Your post'}</Text>

      {isUgc ? (
        <>
          <Button
            label={video ? 'Choose a different video' : 'Choose video'}
            variant="secondary"
            icon="film"
            onPress={async () => {
              const v = await pickVideo();
              if (v) setVideo(v);
            }}
          />
          {video && (
            <View style={styles.file}>
              <SymbolView name="film.fill" tintColor={c.primary} size={22} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {video.name}
                </Text>
                <Text style={styles.checkText}>
                  {mb(video.size)}
                  {video.duration ? ` · ${Math.round(video.duration)} s` : ''}
                </Text>
              </View>
            </View>
          )}
          <Text style={styles.checkText}>The brand receives the original file. Its SHA-256 fingerprint is recorded on Solana, so delivery is provable.</Text>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <SymbolView name="link" tintColor={c.muted} size={18} />
            <TextInput
              style={styles.input}
              placeholder="Paste your TikTok or YouTube link"
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={url}
              onChangeText={setUrl}
              autoFocus
            />
          </View>
          <Button label="Paste from clipboard" variant="secondary" icon="doc.on.clipboard" onPress={async () => setUrl((await Clipboard.getStringAsync()).trim())} />
          <View style={{ gap: 8 }}>
            {POST_CHECKS.map((ck) => (
              <View key={ck} style={styles.check}>
                <SymbolView name="checkmark.circle" tintColor={c.muted} size={16} />
                <Text style={styles.checkText}>{ck}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Button label={stage ?? (isUgc ? 'Deliver video' : 'Submit')} icon="paperplane.fill" busy={!!stage} disabled={!valid} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: c.surface, padding: 24, paddingTop: 28, gap: 16 },
  kicker: { color: c.muted, fontFamily: font.medium, fontSize: 14 },
  title: { color: c.foreground, fontFamily: font.display, fontSize: 26, letterSpacing: -0.5, marginTop: -10 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceRaised, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: c.borderStrong },
  input: { flex: 1, color: c.foreground, fontSize: 16, paddingVertical: 16 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: c.border },
  fileName: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { color: c.muted, fontSize: 13, lineHeight: 18 },
});
