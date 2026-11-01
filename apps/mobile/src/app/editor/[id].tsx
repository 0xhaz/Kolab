import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { postRequirements } from '@kolab/shared';
import KolabVideo, { type ComposeResult } from '../../../modules/kolab-video';
import { EditorPreview, EditorTimeline } from '@/components/editor';
import { Segmented } from '@/components/segmented';
import { Button, Card, Glass, failure, success, tap } from '@/components/ui';
import { useToast } from '@/components/toast';
import { absUrl, saveLocalToPhotos, useBrandKit } from '@/lib/brand-kit';
import {
  DISCLOSURE,
  MUSIC,
  buildSpec,
  clipLength,
  editorAvailable,
  fmt,
  musicPreviewUri,
  newKey,
  pickClips,
  totalLength,
  useEditorApi,
  withHook,
  type EditorState,
  type EditorText,
} from '@/lib/editor';
import { useSlot } from '@/lib/queries';
import { errorMessage } from '@/lib/errors';
import { c, font, radius, ui } from '@/lib/theme';

type Tool = 'clips' | 'text' | 'brand' | 'music';
const NUDGE = 500;
const MUSIC_LEVELS = [
  { value: '0.2', label: 'Soft' },
  { value: '0.35', label: 'Medium' },
  { value: '0.55', label: 'Loud' },
];
const VOICE_LEVELS = [
  { value: '0', label: 'Mute' },
  { value: '0.6', label: 'Low' },
  { value: '1', label: 'Full' },
];

const INITIAL: EditorState = {
  clips: [],
  texts: [],
  captionPosition: 'bottom',
  captionStyle: 'pill',
  watermark: true,
  endCard: true,
  music: 'glow',
  musicVolume: 0.35,
  voiceVolume: 1,
  aspect: '9:16',
};

/** Video editor: clips → hook + captions → brand overlays → music → MP4, rendered on the phone. */
export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  const { slot, enrollment } = useSlot(id);
  const camp = enrollment?.campaign;
  const kit = useBrandKit(camp?.id, !!camp?.hasBrandKit);
  const toast = useToast();
  const ai = useEditorApi(id);

  const [state, setState] = useState<EditorState>(INITIAL);
  const [tool, setTool] = useState<Tool>('clips');
  const [sel, setSel] = useState(0);
  const [local, setLocal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hooks, setHooks] = useState<string[]>([]);
  const [busy, setBusy] = useState<'hooks' | 'captions' | 'clips' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ComposeResult | null>(null);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });
  const bed = useVideoPlayer(null, (p) => {
    p.loop = true;
  });
  const resultPlayer = useVideoPlayer(result ? { uri: result.uri } : null, (p) => {
    p.loop = true;
  });

  const clip = state.clips[sel];
  const offset = state.clips.slice(0, sel).reduce((sum, cl) => sum + clipLength(cl), 0);
  const playhead = clip ? offset + Math.max(0, local - clip.startMs) : 0;
  const total = totalLength(state.clips);
  const update = (patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch }));

  // Load the selected clip at its trim start.
  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    void player.replaceAsync({ uri: clip.uri }).then(() => {
      if (cancelled) return;
      player.currentTime = clip.startMs / 1000;
      if (playing) player.play();
    });
    return () => {
      cancelled = true;
    };
    // Only when the selected source changes; trims seek separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.key]);

  useEffect(() => {
    player.volume = state.voiceVolume;
    bed.volume = state.musicVolume;
  }, [player, bed, state.voiceVolume, state.musicVolume]);

  useEffect(() => {
    if (state.music === 'none') {
      bed.pause();
      return;
    }
    void musicPreviewUri(state.music).then(async (uri) => {
      if (!uri) return;
      await bed.replaceAsync({ uri });
      if (playing) bed.play();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.music]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const ms = currentTime * 1000;
    setLocal(ms);
    if (!clip || !playing || ms < clip.endMs - 60) return;
    if (sel < state.clips.length - 1) setSel(sel + 1);
    else stop();
  });

  useEffect(() => {
    if (!KolabVideo) return;
    const sub = KolabVideo.addListener('onProgress', ({ progress: p }) => setProgress(p));
    return () => sub.remove();
  }, []);

  function play() {
    if (!clip) return;
    if (playhead >= total - 100) {
      setSel(0);
      player.currentTime = (state.clips[0]?.startMs ?? 0) / 1000;
    }
    player.play();
    if (state.music !== 'none') bed.play();
    setPlaying(true);
  }

  function stop() {
    player.pause();
    bed.pause();
    setPlaying(false);
  }

  function setClip(patch: Partial<NonNullable<typeof clip>>) {
    setState((s) => ({ ...s, clips: s.clips.map((cl, i) => (i === sel ? { ...cl, ...patch } : cl)) }));
  }

  async function addClips() {
    setBusy('clips');
    try {
      const picked = await pickClips();
      if (picked.length) setState((s) => ({ ...s, clips: [...s.clips, ...picked] }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  function moveClip(dir: -1 | 1) {
    const to = sel + dir;
    if (to < 0 || to >= state.clips.length) return;
    setState((s) => {
      const clips = [...s.clips];
      [clips[sel], clips[to]] = [clips[to]!, clips[sel]!];
      return { ...s, clips };
    });
    setSel(to);
  }

  function removeClip() {
    setState((s) => ({ ...s, clips: s.clips.filter((_, i) => i !== sel) }));
    setSel(Math.max(0, sel - 1));
  }

  async function loadHooks() {
    setBusy('hooks');
    try {
      setHooks((await ai.hooks()).hooks);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function autoCaptions() {
    stop();
    setBusy('captions');
    try {
      const captions = await ai.autoCaptions(state.clips);
      if (!captions.length) toast('No speech found. Add captions by hand.', 'info');
      setState((s) => ({ ...s, texts: [...s.texts.filter((t) => t.kind !== 'caption'), ...captions] }));
      success();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  function addCaption() {
    const t: EditorText = { key: newKey(), kind: 'caption', text: 'New caption', startMs: playhead, endMs: Math.min(total, playhead + 2000) };
    setState((s) => ({ ...s, texts: [...s.texts, t].sort((a, b) => a.startMs - b.startMs) }));
  }

  function editText(key: string, text: string) {
    setState((s) => ({ ...s, texts: s.texts.map((t) => (t.key === key ? { ...t, text } : t)) }));
  }

  async function exportVideo() {
    if (!KolabVideo || !camp) return;
    stop();
    setProgress(0);
    try {
      const req = postRequirements(camp, enrollment?.voucherCode ?? null);
      const spec = await buildSpec(state, {
        kit: kit.data,
        brandName: camp.brandName ?? req.product,
        cta: req.voucher ? `Use code ${req.voucher}` : req.brandTag,
      });
      setResult(await KolabVideo.compose(spec));
      success();
    } catch (e) {
      failure();
      toast(errorMessage(e), 'error');
    } finally {
      setProgress(null);
    }
  }

  if (!editorAvailable) {
    return (
      <View style={[ui.screen, { paddingTop: insets.top + 80 }]}>
        <Card style={{ gap: 8 }}>
          <Text style={styles.h}>Video editor needs an app update</Text>
          <Text style={styles.muted}>This build doesn’t include the on-device renderer yet. Use the creator kit, or edit in TikTok/CapCut and deliver the file.</Text>
        </Card>
      </View>
    );
  }
  if (!slot || !camp) {
    return (
      <View style={[ui.screen, { paddingTop: insets.top + 80 }]}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const previewWidth = state.aspect === '9:16' ? Math.min(screen * 0.52, 230) : Math.min(screen - 80, 300);
  const captions = state.texts.filter((t) => t.kind === 'caption');
  const hook = state.texts.find((t) => t.kind === 'hook');
  const logoUrl = kit.data?.logo ? absUrl(kit.data.logo.url) : null;
  const canDeliver = slot.kind === 'ugc' && enrollment?.status === 'active' && (slot.status === 'open' || slot.status === 'rejected');

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: 140, gap: 14 }} keyboardShouldPersistTaps="handled">
        <EditorPreview player={player} state={state} playhead={playhead} logoUrl={logoUrl} width={previewWidth} />

        <View style={styles.transport}>
          <Pressable onPress={playing ? stop : play} disabled={!clip} style={styles.playBtn} accessibilityLabel={playing ? 'Pause' : 'Play'}>
            <SymbolView name={playing ? 'pause.fill' : 'play.fill'} tintColor="#fff" size={18} />
          </Pressable>
          <Text style={styles.time}>
            {fmt(playhead)} / {fmt(total)}
          </Text>
        </View>

        <EditorTimeline clips={state.clips} selected={sel} onSelect={setSel} onAdd={addClips} />

        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          <Segmented
            value={tool}
            onChange={setTool}
            options={[
              { value: 'clips', label: 'Clips' },
              { value: 'text', label: 'Text' },
              { value: 'brand', label: 'Brand' },
              { value: 'music', label: 'Music' },
            ]}
          />

          {tool === 'clips' &&
            (clip ? (
              <Card style={{ gap: 12 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.h}>
                    Clip {sel + 1} of {state.clips.length}
                  </Text>
                  <Text style={styles.muted}>
                    {fmt(clip.startMs)} – {fmt(clip.endMs)} · {fmt(clipLength(clip))}
                  </Text>
                </View>
                <View style={styles.trackBar}>
                  <View
                    style={[
                      styles.trackSel,
                      { left: `${(clip.startMs / clip.durationMs) * 100}%`, width: `${(clipLength(clip) / clip.durationMs) * 100}%` },
                    ]}
                  />
                  <View style={[styles.trackHead, { left: `${Math.min(100, (local / clip.durationMs) * 100)}%` }]} />
                </View>
                <View style={styles.row}>
                  <Small label="Start here" icon="arrow.right.to.line" onPress={() => setClip({ startMs: Math.min(local, clip.endMs - 300) })} />
                  <Small label="End here" icon="arrow.left.to.line" onPress={() => setClip({ endMs: Math.max(local, clip.startMs + 300) })} />
                </View>
                <View style={styles.row}>
                  <Small label="Start −½s" onPress={() => setClip({ startMs: Math.max(0, clip.startMs - NUDGE) })} />
                  <Small label="Start +½s" onPress={() => setClip({ startMs: Math.min(clip.endMs - 300, clip.startMs + NUDGE) })} />
                  <Small label="End −½s" onPress={() => setClip({ endMs: Math.max(clip.startMs + 300, clip.endMs - NUDGE) })} />
                  <Small label="End +½s" onPress={() => setClip({ endMs: Math.min(clip.durationMs, clip.endMs + NUDGE) })} />
                </View>
                <View style={styles.row}>
                  <Small label="Move left" icon="chevron.left" onPress={() => moveClip(-1)} />
                  <Small label="Move right" icon="chevron.right" onPress={() => moveClip(1)} />
                  <Small label="Remove" icon="trash" danger onPress={removeClip} />
                </View>
                <Text style={styles.hint}>Play, pause where you want to cut, then tap “Start here” or “End here”.</Text>
              </Card>
            ) : (
              <Button label={busy === 'clips' ? 'Reading clips…' : 'Add clips from Photos'} icon="plus" busy={busy === 'clips'} onPress={addClips} />
            ))}

          {tool === 'text' && (
            <>
              <Card style={{ gap: 10 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.h}>Hook · first 3 seconds</Text>
                  <Small label={busy === 'hooks' ? 'Thinking…' : hooks.length ? 'New ideas' : 'Suggest hooks'} icon="sparkles" onPress={loadHooks} />
                </View>
                {hooks.map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => {
                      tap();
                      setState((s) => ({ ...s, texts: withHook(s.texts, h) }));
                    }}
                    style={[styles.option, hook?.text === h && styles.optionOn]}
                  >
                    <Text style={styles.optionText}>{h}</Text>
                  </Pressable>
                ))}
                <TextInput
                  style={ui.input}
                  placeholder="Or write your own hook"
                  placeholderTextColor={c.faint}
                  value={hook?.text ?? ''}
                  onChangeText={(text) => setState((s) => ({ ...s, texts: text ? withHook(s.texts, text) : s.texts.filter((t) => t.kind !== 'hook') }))}
                />
              </Card>

              <Card style={{ gap: 10 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.h}>Captions</Text>
                  <Text style={styles.muted}>{captions.length}</Text>
                </View>
                <Button
                  label={busy === 'captions' ? 'Listening to your video…' : 'Auto-captions from your voice'}
                  icon="captions.bubble"
                  variant="secondary"
                  busy={busy === 'captions'}
                  disabled={!state.clips.length}
                  onPress={autoCaptions}
                />
                {captions.map((t) => (
                  <View key={t.key} style={styles.captionRow}>
                    <Text style={styles.captionTime}>{fmt(t.startMs)}</Text>
                    <TextInput style={[ui.input, { flex: 1, paddingVertical: 8 }]} value={t.text} onChangeText={(text) => editText(t.key, text)} />
                    <Pressable onPress={() => setState((s) => ({ ...s, texts: s.texts.filter((x) => x.key !== t.key) }))} accessibilityLabel="Delete caption" hitSlop={8}>
                      <SymbolView name="xmark.circle.fill" tintColor={c.faint} size={20} />
                    </Pressable>
                  </View>
                ))}
                <Small label={`Add caption at ${fmt(playhead)}`} icon="plus" onPress={addCaption} />
                <Segmented
                  value={state.captionPosition}
                  onChange={(captionPosition) => update({ captionPosition })}
                  options={[
                    { value: 'bottom', label: 'Bottom' },
                    { value: 'center', label: 'Center' },
                  ]}
                />
                <Segmented
                  value={state.captionStyle}
                  onChange={(captionStyle) => update({ captionStyle })}
                  options={[
                    { value: 'pill', label: 'Box' },
                    { value: 'shadow', label: 'Shadow' },
                  ]}
                />
              </Card>
            </>
          )}

          {tool === 'brand' && (
            <Card style={{ gap: 14 }}>
              <Toggle
                title="Logo watermark"
                sub={kit.data?.logo ? 'Brand logo in the top corner' : 'This brand hasn’t provided a logo'}
                value={state.watermark && !!kit.data?.logo}
                disabled={!kit.data?.logo}
                onChange={(watermark) => update({ watermark })}
              />
              <Toggle
                title="Brand end card"
                sub="2.5s outro: product photo, logo and your code or the brand hashtag"
                value={state.endCard}
                onChange={(endCard) => update({ endCard })}
              />
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.toggleTitle}>{DISCLOSURE}</Text>
                  <Text style={styles.muted}>Always on: paid partnerships must be disclosed on the video.</Text>
                </View>
                <SymbolView name="lock.fill" tintColor={c.faint} size={16} />
              </View>
              <Segmented
                value={state.aspect}
                onChange={(aspect) => update({ aspect })}
                options={[
                  { value: '9:16', label: '9:16 TikTok · Reels' },
                  { value: '1:1', label: '1:1 Post' },
                ]}
              />
            </Card>
          )}

          {tool === 'music' && (
            <Card style={{ gap: 10 }}>
              {[{ id: 'none' as const, label: 'No music', vibe: 'Original sound only', bpm: 0 }, ...MUSIC].map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    tap();
                    update({ music: m.id });
                  }}
                  style={[styles.option, state.music === m.id && styles.optionOn, styles.rowBetween]}
                >
                  <View style={{ gap: 2 }}>
                    <Text style={styles.optionText}>{m.label}</Text>
                    <Text style={styles.muted}>
                      {m.vibe}
                      {m.bpm ? ` · ${m.bpm} bpm` : ''}
                    </Text>
                  </View>
                  {state.music === m.id && <SymbolView name="checkmark.circle.fill" tintColor={c.accent} size={20} />}
                </Pressable>
              ))}
              <Text style={styles.label}>Music volume</Text>
              <Segmented value={String(state.musicVolume)} onChange={(v) => update({ musicVolume: Number(v) })} options={MUSIC_LEVELS} />
              <Text style={styles.label}>Original sound</Text>
              <Segmented value={String(state.voiceVolume)} onChange={(v) => update({ voiceVolume: Number(v) })} options={VOICE_LEVELS} />
              <Text style={styles.hint}>Original Kolab tracks, free to use in brand content.</Text>
            </Card>
          )}
        </View>
      </ScrollView>

      <Glass style={[styles.cta, { bottom: insets.bottom + 8 }]}>
        <Button label={state.clips.length ? `Export ${fmt(total + (state.endCard ? 2500 : 0))} video` : 'Add clips to export'} icon="square.and.arrow.up" disabled={!state.clips.length} onPress={exportVideo} />
      </Glass>

      <Modal visible={progress !== null} transparent animationType="fade">
        <View style={styles.modalBg}>
          <Card style={{ width: 260, gap: 12, alignItems: 'center' }}>
            <Text style={styles.h}>Rendering on your phone</Text>
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${Math.round((progress ?? 0) * 100)}%` }]} />
            </View>
            <Text style={styles.muted}>{Math.round((progress ?? 0) * 100)}%</Text>
          </Card>
        </View>
      </Modal>

      <Modal visible={!!result} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setResult(null)}>
        {result && (
          <View style={{ flex: 1, backgroundColor: c.background, padding: 20, gap: 14 }}>
            <Text style={styles.title}>Your video</Text>
            <Text style={styles.muted}>
              {fmt(result.durationMs)} · {(result.bytes / 1_048_576).toFixed(1)} MB · {state.aspect}
            </Text>
            <VideoView player={resultPlayer} style={{ flex: 1, borderRadius: radius.lg, backgroundColor: '#000' }} contentFit="contain" nativeControls />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Save to Photos"
                  icon="square.and.arrow.down"
                  variant="secondary"
                  onPress={async () => {
                    try {
                      await saveLocalToPhotos(result.uri);
                      success();
                      toast('Saved to Photos', 'success');
                    } catch (e) {
                      toast(errorMessage(e), 'error');
                    }
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Share" icon="square.and.arrow.up" variant="secondary" onPress={() => void Share.share({ url: result.uri })} />
              </View>
            </View>
            {canDeliver ? (
              <Button
                label="Deliver to the brand"
                icon="paperplane.fill"
                onPress={() => {
                  const file = result.uri;
                  setResult(null);
                  router.push({ pathname: '/submit/[id]', params: { id, file } });
                }}
              />
            ) : (
              <Text style={styles.hint}>Post it on TikTok or Reels, then submit the post link from this deliverable.</Text>
            )}
          </View>
        )}
      </Modal>
    </View>
  );
}

function Small({ label, icon, onPress, danger }: { label: string; icon?: Parameters<typeof SymbolView>[0]['name']; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.small}
    >
      {icon && <SymbolView name={icon} tintColor={danger ? c.danger : c.foreground} size={13} />}
      <Text style={[styles.smallText, danger && { color: c.danger }]}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ title, sub, value, onChange, disabled }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.muted}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.accent }} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: c.foreground, fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 },
  h: { color: c.foreground, fontFamily: font.semibold, fontSize: 16 },
  muted: { color: c.muted, fontSize: 13 },
  hint: { color: c.faint, fontSize: 12 },
  label: { color: c.muted, fontFamily: font.medium, fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  time: { color: c.muted, fontFamily: font.medium, fontSize: 14, fontVariant: ['tabular-nums'] },
  trackBar: { height: 10, borderRadius: 5, backgroundColor: c.surfaceRaised, overflow: 'hidden' },
  trackSel: { position: 'absolute', top: 0, bottom: 0, backgroundColor: `${c.accent}99` },
  trackHead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  small: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border },
  smallText: { color: c.foreground, fontFamily: font.medium, fontSize: 13 },
  option: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised },
  optionOn: { borderColor: c.accent, backgroundColor: `${c.accent}1A` },
  optionText: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  captionTime: { color: c.muted, fontSize: 12, width: 38, fontVariant: ['tabular-nums'] },
  toggleTitle: { color: c.foreground, fontFamily: font.semibold, fontSize: 15 },
  cta: { position: 'absolute', left: 16, right: 16, padding: 8, borderRadius: 999 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  progress: { height: 8, alignSelf: 'stretch', borderRadius: 4, backgroundColor: c.surfaceRaised, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: c.accent },
});
