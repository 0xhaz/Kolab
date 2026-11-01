import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { MyEnrollmentDto } from '@kolab/shared';
import { PressableScale } from './ui';
import { useToast } from './toast';
import { slotsNeedingWork } from '@/lib/earnings';
import { c, font, gradients, radius } from '@/lib/theme';

const TOOLS: { key: 'caption' | 'check' | 'post' | 'ugc'; icon: SymbolViewProps['name']; label: string; color: string }[] = [
  { key: 'caption', icon: 'sparkles', label: 'Write caption', color: '#A78BFA' },
  { key: 'check', icon: 'checkmark.shield.fill', label: 'Check my post', color: c.money },
  { key: 'post', icon: 'square.and.arrow.up.fill', label: 'Post to TikTok', color: '#F472B6' },
  { key: 'ugc', icon: 'film.stack.fill', label: 'Deliver UGC', color: '#38BDF8' },
];

/** Entry point to the creator kit from Home: each tool jumps to the next deliverable it applies to. */
export function CreatorKitCard({ enrollments }: { enrollments: MyEnrollmentDto[] }) {
  const toast = useToast();
  const todo = slotsNeedingWork(enrollments);
  const nextPost = todo.find(({ slot }) => slot.kind === 'post')?.slot;
  const nextUgc = todo.find(({ slot }) => slot.kind === 'ugc')?.slot;

  function open(key: (typeof TOOLS)[number]['key']) {
    if (key === 'ugc') {
      if (nextUgc) return router.push({ pathname: '/submit/[id]', params: { id: nextUgc.id } });
      toast('Join a UGC campaign to deliver videos', 'info');
      return router.navigate('/campaigns');
    }
    if (nextPost) return router.push({ pathname: '/kit/[id]', params: { id: nextPost.id } });
    toast('Join a campaign to use the creator kit', 'info');
    router.navigate('/campaigns');
  }

  return (
    <LinearGradient colors={['#7C3AED55', '#DB277733', '#F59E0B22']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.border}>
      <View style={styles.card}>
        <View style={styles.head}>
          <LinearGradient colors={gradients.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
            <SymbolView name="wand.and.stars" tintColor="#fff" size={18} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Creator kit</Text>
            <Text style={styles.sub}>{nextPost || nextUgc ? 'Caption, check and post your next deliverable' : 'Unlocks when you join a campaign'}</Text>
          </View>
        </View>
        <View style={styles.grid}>
          {TOOLS.map((t) => (
            <View key={t.key} style={{ flex: 1 }}>
              <PressableScale onPress={() => open(t.key)} style={styles.tool}>
                <View style={[styles.toolIcon, { backgroundColor: `${t.color}22` }]}>
                  <SymbolView name={t.icon} tintColor={t.color} size={18} />
                </View>
                <Text style={styles.toolLabel} numberOfLines={2}>
                  {t.label}
                </Text>
              </PressableScale>
            </View>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  border: { borderRadius: radius.lg + 1, padding: 1 },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { color: c.foreground, fontFamily: font.display, fontSize: 18 },
  sub: { color: c.muted, fontSize: 13 },
  grid: { flexDirection: 'row', gap: 8 },
  tool: { alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 4, borderRadius: radius.md, backgroundColor: c.surfaceRaised, minHeight: 92 },
  toolIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  toolLabel: { color: c.foreground, fontSize: 11, fontFamily: font.medium, textAlign: 'center' },
});
