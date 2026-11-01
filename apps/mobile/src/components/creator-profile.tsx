import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { PLATFORM_LABEL, type CreatorProfileDto, type Platform, type SampleDto } from '@kolab/shared';
import { absUrl } from '@/lib/brand-kit';
import { compact, missingSteps } from '@/lib/profile';
import { c, font, radius } from '@/lib/theme';
import { Avatar, Button, Card, Chip } from './ui';

export const PLATFORM_SYMBOL: Record<Platform, SymbolViewProps['name']> = {
  tiktok: 'music.note',
  instagram: 'camera.fill',
  youtube: 'play.rectangle.fill',
  facebook: 'person.2.fill',
  x: 'at',
};

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? url;

/** Photo, video or post link, as a square tile. Videos and links show an icon (no remote frame grab). */
export function SampleTile({ sample, size }: { sample: SampleDto; size: number }) {
  const box = { width: size, height: size };
  if (sample.kind === 'image') {
    return <Image source={{ uri: absUrl(sample.url) }} style={[styles.tile, box]} contentFit="cover" transition={150} />;
  }
  const isVideo = sample.kind === 'video';
  return (
    <Pressable style={[styles.tile, styles.tileIcon, box]} onPress={() => Linking.openURL(isVideo ? absUrl(sample.url) : sample.url)}>
      <SymbolView name={isVideo ? 'play.fill' : 'link'} tintColor={c.foreground} size={size * 0.26} />
      {size >= 72 && (
        <Text style={styles.tileText} numberOfLines={1}>
          {isVideo ? 'Video' : host(sample.url)}
        </Text>
      )}
    </Pressable>
  );
}

/** "2 of 3 done: add a sample", with a three-segment bar. */
export function Completeness({ profile }: { profile: CreatorProfileDto }) {
  const missing = missingSteps(profile);
  const done = 3 - missing.length;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.seg, { backgroundColor: i < done ? (done === 3 ? c.money : c.primary) : c.surfaceRaised }]} />
        ))}
      </View>
      <Text style={[styles.caption, done === 3 && { color: c.money }]}>
        {done === 3 ? 'Ready to apply · brands see everything they need' : `${done} of 3 done: ${missing.join(', ')}`}
      </Text>
    </View>
  );
}

/** What brands see when the creator applies. `compact` trims it for the apply sheet. */
export function CreatorProfileCard({ profile, name, onEdit, compact: small }: { profile: CreatorProfileDto; name: string; onEdit?: () => void; compact?: boolean }) {
  const samples = profile.samples.slice(0, small ? 4 : 6);
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.head}>
        <Avatar name={name} size={small ? 40 : 48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.caption} numberOfLines={small ? 1 : 3}>
            {profile.bio || 'No bio yet'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.reach}>{compact(profile.totalFollowers)}</Text>
          <Text style={styles.caption}>total reach</Text>
        </View>
      </View>

      {profile.niches.length > 0 && (
        <View style={styles.wrap}>
          {profile.niches.map((n) => (
            <Chip key={n} label={n} color={c.primary} />
          ))}
        </View>
      )}

      {profile.channels.length > 0 && (
        <View style={{ gap: 8 }}>
          {profile.channels.map((ch) => (
            <View key={`${ch.platform}-${ch.handle}`} style={styles.channel}>
              <SymbolView name={PLATFORM_SYMBOL[ch.platform]} tintColor={c.muted} size={14} />
              <Text style={styles.channelText} numberOfLines={1}>
                {PLATFORM_LABEL[ch.platform]} · @{ch.handle}
              </Text>
              <Text style={styles.followers}>{compact(ch.followers)}</Text>
            </View>
          ))}
          <Text style={styles.fine}>Follower counts are self-declared.</Text>
        </View>
      )}

      {samples.length > 0 && (
        <View style={styles.wrap}>
          {samples.map((sm) => (
            <SampleTile key={sm.id} sample={sm} size={small ? 56 : 64} />
          ))}
        </View>
      )}

      {!small && <Completeness profile={profile} />}
      {onEdit && <Button label={profile.complete ? 'Edit profile' : 'Complete profile'} variant="secondary" icon="pencil" onPress={onEdit} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: c.foreground, fontFamily: font.semibold, fontSize: 17 },
  reach: { color: c.foreground, fontFamily: font.display, fontSize: 20 },
  caption: { color: c.muted, fontSize: 13, lineHeight: 18 },
  fine: { color: c.faint, fontSize: 11 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  channelText: { flex: 1, color: c.foreground, fontSize: 14, fontFamily: font.medium },
  followers: { color: c.foreground, fontFamily: font.semibold, fontSize: 14 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
  tile: { borderRadius: radius.sm, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  tileIcon: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  tileText: { color: c.muted, fontSize: 10, fontFamily: font.medium },
});
