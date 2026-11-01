import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { VideoView, type VideoPlayer } from 'expo-video';
import { DISCLOSURE, clipLength, fmt, type EditorClip, type EditorState } from '@/lib/editor';
import { tap } from './ui';
import { c, font, radius } from '@/lib/theme';

/**
 * Live preview: the selected clip plays in `player`; captions, hook, disclosure and watermark are
 * drawn on top at the same relative positions the renderer uses, scaled to the preview width.
 */
export function EditorPreview({
  player,
  state,
  playhead,
  logoUrl,
  width,
}: {
  player: VideoPlayer;
  state: EditorState;
  playhead: number;
  logoUrl: string | null;
  width: number;
}) {
  const height = state.aspect === '9:16' ? (width * 16) / 9 : width;
  const k = width / 1080;
  const active = state.texts.filter((t) => playhead >= t.startMs && playhead < t.endMs);
  const hook = active.find((t) => t.kind === 'hook');
  const caption = active.find((t) => t.kind === 'caption');

  return (
    <View style={[styles.frame, { width, height }]}>
      {state.clips.length ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : (
        <View style={styles.empty}>
          <SymbolView name="film.stack" tintColor={c.faint} size={36} />
          <Text style={styles.emptyText}>Add clips to start</Text>
        </View>
      )}
      <View style={[styles.disclosure, { top: height * 0.13 - 4, paddingHorizontal: 18 * k, paddingVertical: 8 * k, borderRadius: 40 * k }]}>
        <Text style={{ color: '#fff', fontFamily: font.semibold, fontSize: Math.max(9, 34 * k) }}>{DISCLOSURE}</Text>
      </View>
      {state.watermark && logoUrl && (
        <Image source={{ uri: logoUrl }} contentFit="contain" style={{ position: 'absolute', left: width * 0.79, top: height * 0.105, width: width * 0.17, height: height * 0.07, opacity: 0.92 }} />
      )}
      {hook && (
        <View style={[styles.centerWrap, { top: 0, bottom: 0 }]}>
          <Text style={[styles.hook, { fontSize: Math.max(14, 88 * k), paddingHorizontal: 30 * k, paddingVertical: 14 * k, borderRadius: 40 * k }]}>{hook.text}</Text>
        </View>
      )}
      {caption && (
        <View style={[styles.centerWrap, state.captionPosition === 'bottom' ? { top: height * 0.72 - 40 } : { top: 0, bottom: 0 }]}>
          <Text
            style={[
              styles.caption,
              { fontSize: Math.max(12, 60 * k), paddingHorizontal: 22 * k, paddingVertical: 10 * k, borderRadius: 30 * k },
              state.captionStyle === 'pill' ? { backgroundColor: 'rgba(0,0,0,0.7)' } : styles.shadow,
            ]}
          >
            {caption.text}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Clip strip: widths follow each clip's trimmed length; tap to select, + to add. */
export function EditorTimeline({
  clips,
  selected,
  onSelect,
  onAdd,
}: {
  clips: EditorClip[];
  selected: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
      {clips.map((clip, i) => (
        <Pressable
          key={clip.key}
          onPress={() => {
            tap();
            onSelect(i);
          }}
          style={[styles.clip, { width: Math.max(64, Math.min(180, clipLength(clip) / 60)) }, i === selected && styles.clipOn]}
        >
          {clip.thumb && <Image source={{ uri: clip.thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />}
          <View style={styles.clipLabel}>
            <Text style={styles.clipText}>{fmt(clipLength(clip))}</Text>
          </View>
        </Pressable>
      ))}
      <Pressable onPress={onAdd} style={[styles.clip, styles.add]} accessibilityLabel="Add clips">
        <SymbolView name="plus" tintColor={c.foreground} size={20} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#000', borderRadius: radius.lg, overflow: 'hidden', alignSelf: 'center' },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: c.muted, fontSize: 14 },
  disclosure: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  centerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: '7%' },
  hook: { color: '#fff', fontFamily: font.display, textAlign: 'center', backgroundColor: 'rgba(219,39,119,0.9)', overflow: 'hidden' },
  caption: { color: '#fff', fontFamily: font.display, textAlign: 'center', overflow: 'hidden' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  clip: { height: 64, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.surfaceRaised, borderWidth: 2, borderColor: 'transparent' },
  clipOn: { borderColor: c.accent },
  clipLabel: { position: 'absolute', bottom: 3, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 4 },
  clipText: { color: '#fff', fontSize: 10, fontFamily: font.semibold },
  add: { width: 64, alignItems: 'center', justifyContent: 'center', borderColor: c.borderStrong, borderStyle: 'dashed' },
});
