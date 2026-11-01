import { StyleSheet } from 'react-native';

/**
 * Mobile design tokens. Dark-first social look: near-black canvas, raised surfaces with hairlines,
 * one signature gradient used sparingly (balance, primary CTA, story ring), mint for money.
 */
export const c = {
  background: '#07070B',
  surface: '#111118',
  surfaceRaised: '#1A1A24',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  foreground: '#F6F6FA',
  muted: '#9C9CB0',
  faint: '#62627A',
  primary: '#8B5CF6',
  accent: '#EC4899',
  money: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  // legacy names used by older screens
  card: '#111118',
  cardElevated: '#1A1A24',
  success: '#34D399',
} as const;

export const gradients = {
  glow: ['#7C3AED', '#DB2777', '#F59E0B'] as const,
  violet: ['#6D28D9', '#8B5CF6'] as const,
  /** Generated campaign covers, picked deterministically from the campaign id. */
  covers: [
    ['#7C3AED', '#EC4899'],
    ['#0EA5E9', '#8B5CF6'],
    ['#F97316', '#DB2777'],
    ['#10B981', '#0EA5E9'],
    ['#F59E0B', '#EF4444'],
    ['#6366F1', '#22D3EE'],
  ] as const,
};

export const font = {
  display: 'Outfit_700Bold',
  semibold: 'Outfit_600SemiBold',
  medium: 'Outfit_500Medium',
} as const;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background, padding: 20, gap: 16 },
  title: { color: c.foreground, fontSize: 32, fontFamily: font.display, letterSpacing: -0.5 },
  body: { color: c.muted, fontSize: 15, lineHeight: 22 },
  mono: { color: c.foreground, fontSize: 13, fontFamily: 'Menlo' },
  input: {
    backgroundColor: c.surfaceRaised,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: c.foreground,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: { color: c.danger, fontSize: 14 },
});
