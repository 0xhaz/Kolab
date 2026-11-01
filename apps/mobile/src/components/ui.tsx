import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { SlotStatusName } from '@kolab/shared';
import { c, font, gradients, radius } from '@/lib/theme';

const glass = isLiquidGlassAvailable();
export const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
export const success = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
export const failure = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

// ------------------------------------------------------------------ layout

export function Screen({
  title,
  subtitle,
  right,
  children,
  refreshing,
  onRefresh,
  edges = ['top'],
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      <ScrollView
        contentContainerStyle={s.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl tintColor={c.muted} refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {(title || right) && (
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
              {title && <Text style={s.title}>{title}</Text>}
            </View>
            {right}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Kept for older screens. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

// ------------------------------------------------------------------ surfaces & press

/** Spring-scales on press with a light haptic: every tappable surface uses this. */
export function PressableScale({
  children,
  onPress,
  style,
  disabled,
  haptic = true,
  containerStyle,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: boolean;
  /** Layout for the outer touch target (e.g. flex: 1 in a row). */
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      style={containerStyle}
      disabled={disabled || !onPress}
      onPressIn={() => {
        scale.set(withSpring(0.97, { damping: 18, stiffness: 400 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
      }}
      onPress={() => {
        if (haptic) tap();
        onPress?.();
      }}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  return (
    <PressableScale onPress={onPress} style={[s.card, style]} haptic={!!onPress}>
      {children}
    </PressableScale>
  );
}

/** Liquid Glass on iOS 26, a translucent surface elsewhere. */
export function Glass({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  if (glass) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" tintColor={tint} style={[s.glass, style]}>
        {children}
      </GlassView>
    );
  }
  return <View style={[s.glass, { backgroundColor: 'rgba(28,28,38,0.85)' }, style]}>{children}</View>;
}

// ------------------------------------------------------------------ buttons

export function Button({
  label,
  onPress,
  busy,
  disabled,
  variant = 'primary',
  icon,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: SymbolViewProps['name'];
}) {
  const off = busy || disabled;
  const content = busy ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <View style={s.buttonRow}>
      {icon && <SymbolView name={icon} tintColor={variant === 'danger' ? c.danger : '#fff'} size={18} />}
      <Text style={[s.buttonText, variant === 'danger' && { color: c.danger }]}>{label}</Text>
    </View>
  );
  return (
    <PressableScale onPress={onPress} disabled={off} style={off && { opacity: 0.45 }}>
      {variant === 'primary' ? (
        <LinearGradient colors={gradients.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.button}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[s.button, variant === 'secondary' ? s.buttonSecondary : s.buttonDanger]}>{content}</View>
      )}
    </PressableScale>
  );
}

// ------------------------------------------------------------------ identity

const initials = (name: string) =>
  name
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

/** Initials avatar; `ring` draws the gradient "story ring" used on the profile. */
export function Avatar({ name, size = 40, ring }: { name: string; size?: number; ring?: boolean }) {
  const inner = (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: c.foreground, fontFamily: font.semibold, fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
  if (!ring) return inner;
  return (
    <LinearGradient colors={gradients.glow} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ padding: 3, borderRadius: size }}>
      <View style={{ padding: 3, borderRadius: size, backgroundColor: c.background }}>{inner}</View>
    </LinearGradient>
  );
}

// ------------------------------------------------------------------ labels

export function Chip({ label, color = c.muted, icon }: { label: string; color?: string; icon?: SymbolViewProps['name'] }) {
  return (
    <View style={[s.chip, { borderColor: `${color}55`, backgroundColor: `${color}1A` }]}>
      {icon && <SymbolView name={icon} tintColor={color} size={12} />}
      <Text style={[s.chipText, { color }]}>{label}</Text>
    </View>
  );
}
/** Kept for older screens. */
export const Pill = ({ label, color }: { label: string; color: string }) => <Chip label={label} color={color} />;

const SLOT: Record<SlotStatusName, { label: string; color: string; icon: SymbolViewProps['name'] }> = {
  open: { label: 'To do', color: '#A5A5BC', icon: 'circle.dashed' },
  submitted: { label: 'In review', color: '#818CF8', icon: 'hourglass' },
  approved: { label: 'Approved', color: c.primary, icon: 'checkmark.circle' },
  rejected: { label: 'Changes requested', color: c.warning, icon: 'arrow.uturn.backward.circle' },
  released: { label: 'Paid', color: c.money, icon: 'checkmark.circle.fill' },
  holdback_released: { label: 'Paid in full', color: c.money, icon: 'checkmark.seal.fill' },
  missed: { label: 'Missed', color: c.danger, icon: 'xmark.circle' },
  holdback_forfeited: { label: 'Post removed', color: c.danger, icon: 'exclamationmark.circle' },
};
export const slotStyle = (status: SlotStatusName) => SLOT[status];

export function SlotPill({ status }: { status: SlotStatusName }) {
  const st = SLOT[status];
  return <Chip label={st.label} color={st.color} icon={st.icon} />;
}

/** One segment per deliverable, coloured by status (with the count in text beside it). */
export function SlotStrip({ statuses }: { statuses: SlotStatusName[] }) {
  const done = statuses.filter((st) => st === 'released' || st === 'holdback_released').length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 4, flex: 1 }}>
        {statuses.map((st, i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: st === 'open' ? c.surfaceRaised : SLOT[st].color }} />
        ))}
      </View>
      <Text style={s.stripText}>
        {done}/{statuses.length} paid
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ text

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'money' }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[s.statValue, tone === 'money' && { color: c.money }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={[s.value, mono && s.mono]} selectable>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

export const Muted = ({ children }: { children: ReactNode }) => <Text style={s.muted}>{children}</Text>;
export const Body = ({ children }: { children: ReactNode }) => <Text style={s.body}>{children}</Text>;
export const Heading = ({ children }: { children: ReactNode }) => <Text style={s.heading}>{children}</Text>;
export const Big = ({ children }: { children: ReactNode }) => <Text style={s.big}>{children}</Text>;

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: 20, gap: 20, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: -4 },
  subtitle: { color: c.muted, fontSize: 15, fontFamily: font.medium },
  title: { color: c.foreground, fontSize: 32, fontFamily: font.display, letterSpacing: -0.6 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  sectionTitle: { color: c.foreground, fontSize: 20, fontFamily: font.display, letterSpacing: -0.3 },
  sectionAction: { color: c.primary, fontSize: 15, fontFamily: font.semibold },
  card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 10 },
  glass: { borderRadius: radius.lg, padding: 16, gap: 10, overflow: 'hidden' },
  button: { borderRadius: radius.pill, paddingVertical: 16, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderStrong },
  buttonDanger: { borderWidth: 1, borderColor: `${c.danger}88` },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontFamily: font.semibold },
  avatar: { backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.borderStrong },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontFamily: font.semibold },
  stripText: { color: c.muted, fontSize: 12, fontFamily: font.medium },
  statValue: { color: c.foreground, fontSize: 22, fontFamily: font.display, letterSpacing: -0.3 },
  statLabel: { color: c.muted, fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { color: c.muted, fontSize: 14, flexShrink: 1 },
  value: { color: c.foreground, fontSize: 15, fontFamily: font.medium, flexShrink: 1, textAlign: 'right' },
  mono: { fontFamily: 'Menlo', fontSize: 13 },
  muted: { color: c.muted, fontSize: 14, lineHeight: 20 },
  body: { color: c.foreground, fontSize: 15, lineHeight: 22 },
  heading: { color: c.foreground, fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.2 },
  big: { color: c.foreground, fontSize: 40, fontFamily: font.display, letterSpacing: -1 },
});
